import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import { AnalysesService } from "src/base_modules/analyses/analyses.service";
import { AnalysisStatus } from "src/base_modules/analyses/analysis.entity";
import { AnalysisCreateBody } from "src/base_modules/analyses/analysis.types";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { GithubIntegrationService } from "src/base_modules/integrations/github/github.service";
import {
  type GithubApiError,
  isRateLimitError,
} from "src/base_modules/integrations/github/githubRateLimit";
import {
  createGithubClient,
  type GithubCommitItem,
  type GithubRepoMetadata,
  type GithubRestClient,
} from "src/base_modules/integrations/github/githubSearch";
import { ProjectService } from "src/base_modules/projects/projects.service";
import { ProvenanceService } from "src/codeclarity_modules/knowledge/provenance/provenance.service";
import { CodeClarityLogger } from "src/services/logger.service";
import {
  APIError,
  EntityNotFound,
  NotAuthorized,
} from "src/types/error.types";

import { describeBuildError } from "../datasets/dataset-build.service";
import { GithubRateLimited, rateLimitedAt } from "../datasets/dataset-builder";

import { Experiment, ExperimentStatus } from "./experiment.entity";
import { isUsablePluginResult, mapRunRows } from "./experiment-row-copy";
import { ExperimentRun, ExperimentRunStatus } from "./experiment-run.entity";
import { ExperimentLeaseLost, ExperimentStore } from "./experiment-store";

/** How often experiments are looked at (in-flight analyses polled) */
const TICK_MS = 15_000;
/** Short rate limit waits are sat out inside the request */
const MAX_THROTTLE_WAIT_SECONDS = 60;
const DEFAULT_MAX_IN_FLIGHT = 8;
const DEFAULT_RUN_CEILING_HOURS = 24;
/** The results a done run is copied from (the analyzer must run both) */
const SBOM_PLUGIN = "js-sbom";
const VULN_PLUGIN = "vuln-finder";

const SUCCEEDED: ReadonlySet<string> = new Set([
  AnalysisStatus.SUCCESS,
  AnalysisStatus.COMPLETED,
]);
/** The Go services write "failure", the API "failed" */
const FAILED: ReadonlySet<string> = new Set([
  AnalysisStatus.FAILED,
  AnalysisStatus.CANCELLED,
  "failure",
]);

/** The run cannot be done: never retried. */
class RunSkipped extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "RunSkipped";
  }
}

/** Nothing more can be submitted for the whole experiment. */
class ExperimentFatal extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ExperimentFatal";
  }
}

interface PinnedHead {
  branch: string;
  commitHash: string;
  committedAt: Date | null;
  description: string | null;
}

function analysisContext(run: ExperimentRun): { analysisId?: string } {
  return run.analysis ? { analysisId: run.analysis.id } : {};
}

function positiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readApiVersion(): string | null {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const version = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * Drives experiments in the background (ADR 0002). Nothing is kept in
 * memory between passes: each tick leases experiments oldest first, polls
 * their in-flight analyses in the DB, and submits new ones while the global
 * in-flight cap allows, so a restarted API resumes once the lease expires.
 */
@Injectable()
export class ExperimentRunnerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = CodeClarityLogger.forService("ExperimentRunner");
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID()}`;
  private readonly enabled =
    process.env["EXPERIMENT_RUNNER_ENABLED"] !== "false";
  private readonly maxInFlight = Math.floor(
    positiveNumberEnv("EXPERIMENT_MAX_IN_FLIGHT", DEFAULT_MAX_IN_FLIGHT),
  );
  private readonly ceilingMs =
    positiveNumberEnv(
      "EXPERIMENT_RUN_CEILING_HOURS",
      DEFAULT_RUN_CEILING_HOURS,
    ) * 3_600_000;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private tickRequested = false;
  private stopped = false;

  constructor(
    private readonly store: ExperimentStore,
    private readonly githubIntegrationService: GithubIntegrationService,
    private readonly projectService: ProjectService,
    private readonly analysesService: AnalysesService,
    private readonly provenanceService: ProvenanceService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.enabled) this.schedule(0);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** Look for work now rather than at the next tick. */
  kick(): void {
    if (!this.enabled || this.stopped) return;
    if (this.running) {
      this.tickRequested = true;
      return;
    }
    this.schedule(0);
  }

  /**
   * Stop submitting: unsubmitted runs are skipped, in-flight analyses finish
   * and are still completed by later passes.
   * @returns false if the experiment had already ended
   */
  async cancel(experimentId: string): Promise<boolean> {
    const cancelled = await this.store.cancel(experimentId);
    if (cancelled) {
      this.logger.log("Experiment cancelled", { experimentId });
      this.kick();
    }
    return cancelled;
  }

  /** One pass over every experiment that can be claimed, oldest first. */
  async tick(): Promise<void> {
    if (this.running) {
      this.tickRequested = true;
      return;
    }
    this.running = true;
    try {
      const handled: string[] = [];
      for (;;) {
        const experimentId = await this.store.claimNext(
          this.instanceId,
          handled,
        );
        if (!experimentId) break;
        handled.push(experimentId);
        await this.drive(experimentId);
      }
    } catch (err) {
      this.logger.error(
        "Experiment runner tick failed",
        err instanceof Error ? err : String(err),
      );
    } finally {
      this.running = false;
      const again = this.tickRequested;
      this.tickRequested = false;
      if (!this.stopped) this.schedule(again ? 0 : TICK_MS);
    }
  }

  /**
   * Apply the done definition to a run whose analysis succeeded: both its
   * js-sbom and vuln-finder results exist and are usable, and their tidy
   * rows are copied (replacing any copied before). Otherwise the attempt
   * failed with `missing result: <plugin>`, which is retried like any other.
   */
  async completeRun(experiment: Experiment, run: ExperimentRun): Promise<void> {
    const logContext = {
      experimentId: experiment.id,
      runId: run.id,
      ...analysisContext(run),
    };
    const results = new Map<string, unknown>();
    for (const plugin of [SBOM_PLUGIN, VULN_PLUGIN]) {
      const result = run.analysis
        ? await this.store.getPluginResult(run.analysis.id, plugin)
        : null;
      if (!isUsablePluginResult(result)) {
        this.logger.warn("Experiment run has no usable result", {
          ...logContext,
          plugin,
        });
        await this.attemptFailed(experiment, run, `missing result: ${plugin}`);
        return;
      }
      results.set(plugin, result);
    }

    const rows = mapRunRows(results.get(SBOM_PLUGIN), results.get(VULN_PLUGIN));
    const copied = await this.store.copyRunRows(experiment.id, run.id, rows);
    if (!copied) {
      this.logger.warn("Experiment run ended before its rows were copied", logContext);
      return;
    }
    this.logger.log("Experiment run done", {
      ...logContext,
      dependencies: rows.summary.total_dependencies,
      vulnerabilities: rows.summary.total_vulnerabilities,
    });
  }

  /** One pass over one claimed experiment. */
  private async drive(experimentId: string): Promise<void> {
    const experiment = await this.store.getExperiment(experimentId);
    if (!experiment) return;
    const logContext = {
      experimentId,
      organizationId: experiment.organization.id,
    };

    try {
      if (experiment.status === ExperimentStatus.PENDING) {
        await this.start(experiment);
      }
      await this.pollInFlight(experiment);
      // Read again: a cancel may have committed since the pass began
      const status = await this.store.getStatus(experimentId);
      if (status === null) return;
      experiment.status = status;
      if (status === ExperimentStatus.CANCELLED) {
        await this.store.skipUnsubmitted(experimentId);
      } else if (status === ExperimentStatus.RUNNING) {
        await this.submit(experiment);
      }
      if ((await this.store.countPending(experimentId)) === 0) {
        await this.end(experiment);
      }
    } catch (err) {
      if (err instanceof ExperimentLeaseLost) {
        this.logger.warn("Experiment pass abandoned: lease lost", logContext);
        return;
      }
      if (err instanceof GithubRateLimited) {
        await this.store.release(
          experimentId,
          this.instanceId,
          new Date(err.retryAt),
        );
        this.logger.warn("Experiment paused by the GitHub rate limit", {
          ...logContext,
          retryAt: new Date(err.retryAt).toISOString(),
        });
        return;
      }
      if (err instanceof ExperimentFatal) {
        await this.store.finish(experimentId, this.instanceId, {
          status: ExperimentStatus.FAILED,
          error: err.reason,
          provenance: await this.endProvenance(experiment),
        });
        this.logger.error("Experiment failed", err, {
          ...logContext,
          reason: err.reason,
        });
        return;
      }
      // Transient (DB, network): the lease is kept and the next tick retries.
      this.logger.error(
        "Experiment pass failed",
        err instanceof Error ? err : String(err),
        logContext,
      );
    }
  }

  /** Snapshot the analyzer and knowledge provenance; PENDING to RUNNING. */
  private async start(experiment: Experiment): Promise<void> {
    if (!experiment.analyzer) {
      throw new ExperimentFatal("The analyzer of this experiment was removed");
    }
    const analyzerSteps = experiment.analyzer.steps.map((stage) =>
      stage.map(({ name, version }) => ({ name, version })),
    );
    const provenance = {
      api_version: readApiVersion(),
      knowledge_start: await this.provenanceService.get(),
    };
    await this.store.start(experiment.id, this.instanceId, {
      analyzer_steps: analyzerSteps,
      provenance,
    });
    Object.assign(experiment, {
      status: ExperimentStatus.RUNNING,
      analyzer_steps: analyzerSteps,
      provenance,
    });
    this.logger.log("Experiment started", {
      experimentId: experiment.id,
      organizationId: experiment.organization.id,
    });
  }

  private async pollInFlight(experiment: Experiment): Promise<void> {
    const now = Date.now();
    for (const run of await this.store.getInFlightRuns(experiment.id)) {
      const status = run.analysis?.status;
      if (!run.analysis) {
        await this.attemptFailed(experiment, run, "analysis deleted");
      } else if (status && SUCCEEDED.has(status)) {
        await this.completeRun(experiment, run);
      } else if (status && FAILED.has(status)) {
        await this.attemptFailed(
          experiment,
          run,
          run.analysis.failure_reason ?? `analysis ${status}`,
        );
      } else if (this.pastCeiling(run, now)) {
        await this.store.updateRun(run.id, {
          status: ExperimentRunStatus.FAILED,
          error: "ceiling",
          ended_on: new Date(),
        });
        this.logger.warn("Experiment run hit the ceiling", {
          experimentId: experiment.id,
          analysisId: run.analysis.id,
        });
      }
    }
  }

  /** Not terminal this long after its first analysis was submitted. */
  private pastCeiling(run: ExperimentRun, now: number): boolean {
    const since = run.first_submitted_on ?? run.submitted_on;
    return since ? now - since.getTime() > this.ceilingMs : false;
  }

  /** Submit unsubmitted runs, by entry rank, while the global cap allows. */
  private async submit(experiment: Experiment): Promise<void> {
    const slots = this.maxInFlight - (await this.store.countInFlight());
    if (slots <= 0) return;
    const runs = await this.store.getUnsubmittedRuns(experiment.id, slots);
    if (runs.length === 0) return;

    const integrationId = experiment.dataset.integration?.id;
    if (!integrationId) {
      throw new ExperimentFatal(
        "The GitHub integration of this dataset was removed",
      );
    }
    if (!experiment.created_by) {
      throw new ExperimentFatal("The creator of this experiment was removed");
    }
    const creator = new AuthenticatedUser(
      experiment.created_by.id,
      [ROLE.USER],
      true,
    );
    const client = await this.githubClient(integrationId);

    for (const run of runs) {
      await this.store.renewLease(experiment.id, this.instanceId);
      await this.submitRun(experiment, run, client, integrationId, creator);
    }
  }

  private async submitRun(
    experiment: Experiment,
    run: ExperimentRun,
    client: GithubRestClient,
    integrationId: string,
    creator: AuthenticatedUser,
  ): Promise<void> {
    const entry = run.dataset_entry;
    const orgId = experiment.organization.id;
    const logContext = { experimentId: experiment.id, runId: run.id };

    let head: PinnedHead;
    if (run.commit_hash && run.branch) {
      // A retry: same pinned SHA
      head = {
        branch: run.branch,
        commitHash: run.commit_hash,
        committedAt: run.committed_at ?? null,
        description: null,
      };
    } else {
      try {
        head = await this.pinHead(client, entry);
      } catch (err) {
        if (!(err instanceof RunSkipped)) throw err;
        await this.store.updateRun(run.id, {
          status: ExperimentRunStatus.SKIPPED,
          error: err.reason,
          ended_on: new Date(),
        });
        this.logger.log("Experiment run skipped", {
          ...logContext,
          reason: err.reason,
        });
        return;
      }
    }
    const pinned = {
      branch: head.branch,
      commit_hash: head.commitHash,
      committed_at: head.committedAt,
    };
    const attempt = { ...run, attempts: run.attempts + 1 };

    // Reserve the run first: a cancel only skips unsubmitted runs, so once
    // reserved it cannot be skipped under the analysis created for it
    const now = new Date();
    const reserved = await this.store.updateRun(run.id, {
      ...pinned,
      attempts: attempt.attempts,
      submitted_on: now,
      first_submitted_on: run.first_submitted_on ?? now,
    });
    if (!reserved) {
      this.logger.log("Experiment run no longer pending", logContext);
      return;
    }

    let projectId: string;
    let analysisId: string;
    try {
      projectId = await this.projectService.importForExperiment(
        orgId,
        integrationId,
        {
          url: entry.git_url,
          full_name: entry.full_name,
          description: head.description,
          default_branch: head.branch,
        },
        creator,
      );
      analysisId = await this.analysesService.create(
        orgId,
        projectId,
        this.analysisBody(experiment, orgId, projectId, head),
        creator,
      );
    } catch (err) {
      if (err instanceof NotAuthorized) {
        throw new ExperimentFatal(
          "The creator of this experiment is no longer allowed to analyze projects of the organization",
        );
      }
      if (err instanceof EntityNotFound) {
        throw new ExperimentFatal(
          "The GitHub integration of this dataset no longer belongs to the organization",
        );
      }
      const reason = `submission failed: ${describeBuildError(err)}`;
      await this.attemptFailed(experiment, attempt, reason);
      this.logger.warn("Experiment run submission failed", {
        ...logContext,
        reason,
      });
      return;
    }

    const linked = await this.store.updateRun(run.id, {
      analysis: { id: analysisId },
    });
    if (!linked) {
      this.logger.warn("Experiment run ended before its analysis was linked", {
        ...logContext,
        analysisId,
      });
      return;
    }
    this.logger.log("Experiment run submitted", {
      ...logContext,
      projectId,
      analysisId,
      commitHash: head.commitHash,
    });
  }

  /**
   * A failed attempt is retried on the same SHA while attempts remain and
   * the experiment is still RUNNING; otherwise the run fails. A retry set
   * up while a cancel commits is skipped by the end of the pass.
   * `run.attempts` counts the attempt that failed.
   */
  private async attemptFailed(
    experiment: Experiment,
    run: ExperimentRun,
    reason: string,
  ): Promise<void> {
    const retry =
      experiment.status === ExperimentStatus.RUNNING &&
      run.attempts <= experiment.retries;
    await this.store.updateRun(run.id, {
      attempts: run.attempts,
      error: reason,
      ...(retry
        ? { submitted_on: null }
        : { status: ExperimentRunStatus.FAILED, ended_on: new Date() }),
    });
    this.logger.log(
      retry ? "Experiment run will be retried" : "Experiment run failed",
      {
        experimentId: experiment.id,
        runId: run.id,
        ...analysisContext(run),
        attempts: run.attempts,
        reason,
      },
    );
  }

  /** Every run is terminal: COMPLETED (or stays CANCELLED), provenance at end. */
  private async end(experiment: Experiment): Promise<void> {
    await this.store.finish(experiment.id, this.instanceId, {
      status:
        experiment.status === ExperimentStatus.CANCELLED
          ? ExperimentStatus.CANCELLED
          : ExperimentStatus.COMPLETED,
      provenance: await this.endProvenance(experiment),
    });
    this.logger.log("Experiment ended", {
      experimentId: experiment.id,
      organizationId: experiment.organization.id,
      status: experiment.status,
    });
  }

  /** The start provenance with the knowledge snapshot at end added. */
  private async endProvenance(
    experiment: Experiment,
  ): Promise<Record<string, unknown>> {
    return {
      ...(experiment.provenance ?? {}),
      knowledge_end: await this.provenanceService.get(),
    };
  }

  /**
   * The repository's live default branch and its tip.
   * @throws {RunSkipped} If the repository is gone, moved or has no branch
   * @throws {GithubRateLimited} If GitHub rate limited the request
   * @throws {ExperimentFatal} If the token is no longer accepted or allowed
   */
  private async pinHead(
    client: GithubRestClient,
    entry: ExperimentRun["dataset_entry"],
  ): Promise<PinnedHead> {
    const params = { owner: entry.owner, repo: entry.repo };
    let repo: GithubRepoMetadata;
    let commits: GithubCommitItem[];
    try {
      repo = ((await client.rest.repos.get(params)) as { data: GithubRepoMetadata })
        .data;
      if (repo.html_url.toLowerCase() !== entry.git_url.toLowerCase()) {
        throw new RunSkipped(`repository moved to ${repo.html_url}`);
      }
      if (!repo.default_branch) throw new RunSkipped("no default branch");
      commits = (
        (await client.rest.repos.listCommits({
          ...params,
          sha: repo.default_branch,
          per_page: 1,
        })) as { data: GithubCommitItem[] }
      ).data;
    } catch (err) {
      if (err instanceof RunSkipped) throw err;
      throw this.classifyGithubError(err);
    }

    const tip = commits[0];
    if (!tip) throw new RunSkipped(`no commits on ${repo.default_branch}`);
    const date = tip.commit.committer?.date ?? tip.commit.author?.date;
    return {
      branch: repo.default_branch,
      commitHash: tip.sha,
      committedAt: date ? new Date(date) : null,
      description: repo.description ?? null,
    };
  }

  private classifyGithubError(err: unknown): Error {
    const apiError = err as GithubApiError;
    if (isRateLimitError(apiError)) return rateLimitedAt(apiError, Date.now());
    switch (apiError.status) {
      case 401:
        return new ExperimentFatal(
          `GitHub authentication failed: ${apiError.message ?? "bad credentials"}`,
        );
      case 403:
        // Not a rate limit: the token lost its scope or is blocked by SSO,
        // which would skip every run alike
        return new ExperimentFatal(
          `GitHub access denied: ${apiError.message ?? "forbidden"}`,
        );
      case 404:
        return new RunSkipped("repository or branch not found");
      case 409:
        return new RunSkipped("empty repository");
      case 422:
        return new RunSkipped("branch not found");
      default:
        return err instanceof Error
          ? err
          : new Error(apiError.message ?? String(err));
    }
  }

  /** @throws {ExperimentFatal} If the integration's token cannot be used */
  private async githubClient(integrationId: string): Promise<GithubRestClient> {
    let token: string;
    try {
      token = (
        await this.githubIntegrationService.getToken(integrationId)
      ).getToken();
    } catch (err) {
      if (err instanceof APIError) {
        throw new ExperimentFatal(
          `The GitHub integration cannot be used: ${describeBuildError(err)}`,
        );
      }
      throw err;
    }
    return createGithubClient(token, {
      maxThrottleWaitSeconds: MAX_THROTTLE_WAIT_SECONDS,
    });
  }

  /** Same body as the archived harness, pinned to the SHA. */
  private analysisBody(
    experiment: Experiment,
    orgId: string,
    projectId: string,
    head: PinnedHead,
  ): AnalysisCreateBody {
    return {
      analyzer_id: experiment.analyzer!.id,
      branch: head.branch,
      commit_hash: head.commitHash,
      schedule_type: "once",
      languages: ["javascript"],
      config: {
        "js-sbom": {
          project: `${orgId}/projects/${projectId}/${head.commitHash}`,
          branch: head.branch,
        },
        "vuln-finder": {},
        "license-finder": { licensePolicy: [] },
      },
    };
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
    this.timer.unref();
  }
}
