import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import { analysisOutcome } from "src/base_modules/analyses/analysis-outcome";
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
import { ProvenanceService } from "src/codeclarity_modules/knowledge/provenance/provenance.service";
import { CodeClarityLogger } from "src/services/logger.service";
import { APIError, EntityNotFound, NotAuthorized } from "src/types/error.types";

import { describeBuildError } from "../datasets/dataset-build.service";
import { GithubRateLimited, rateLimitedAt } from "../datasets/dataset-builder";

import { Experiment, ExperimentStatus } from "./experiment.entity";
import { analysesLeft } from "./experiment-budget";
import { planProbes } from "./experiment-exposures";
import { endOfGridDay } from "./experiment-grid";
import type { ExperimentProbe } from "./experiment-probe.entity";
import {
  type IntervalRequest,
  type ProbeCandidate,
  type ProbeRequest,
  repoLockfilePath,
} from "./experiment-probes";
import type { ResultsRunInput } from "./experiment-results";
import {
  isNoLockfileResult,
  isNoManifestFailure,
  isUsablePluginResult,
  mapProbePackages,
  mapRunRows,
  NO_LOCKFILE_YET,
  type ProbePackage,
  unwrapResultEnvelope,
} from "./experiment-row-copy";
import { ExperimentRun, ExperimentRunStatus } from "./experiment-run.entity";
import {
  ExperimentRunSubmission,
  PinnedHead,
} from "./experiment-run-submission";
import { ExperimentLeaseLost, ExperimentStore } from "./experiment-store";
import {
  EXPERIMENT_REQUIRED_PLUGINS,
  SBOM_PLUGIN,
  VULN_PLUGIN,
} from "./experiments.types";

/** How often experiments are looked at (in-flight analyses polled) */
const TICK_MS = 15_000;
/** How often to check whether an in-flight analysis finished */
const DEFAULT_WATCH_MS = 2_000;
/** Short rate limit waits are sat out inside the request */
const MAX_THROTTLE_WAIT_SECONDS = 60;
const DEFAULT_MAX_IN_FLIGHT = 16;
const DEFAULT_RUN_CEILING_HOURS = 24;
/** Lockfile-touching commits listed per interval: 10 pages of 100 */
const COMMITS_PER_PAGE = 100;
const MAX_COMMIT_PAGES = 10;
const TOO_MANY_COMMITS_REASON = "too many commits";

/** A repository that can be pinned: it exists where expected, with a branch. */
interface PinnableRepo {
  branch: string;
  description: string | null;
}

/** Who submits an experiment's analyses, and through which integration. */
interface Submitter {
  integrationId: string;
  creator: AuthenticatedUser;
}

/** Repository lookups of one pass, by dataset entry id */
type RepoLookups = Map<string, Promise<PinnableRepo>>;

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

/** The snapshot's grid date has no commit on or before it. */
class NoCommitYet extends Error {
  constructor(readonly branch: string) {
    super("no commit yet");
    this.name = "NoCommitYet";
  }
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
 * Between ticks, a cheap check every EXPERIMENT_WATCH_MS kicks a pass as soon
 * as an in-flight analysis finishes.
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
  private readonly watchMs = positiveNumberEnv(
    "EXPERIMENT_WATCH_MS",
    DEFAULT_WATCH_MS,
  );
  private timer: NodeJS.Timeout | undefined;
  private watchTimer: NodeJS.Timeout | undefined;
  private running = false;
  private tickRequested = false;
  private stopped = false;

  constructor(
    private readonly store: ExperimentStore,
    private readonly githubIntegrationService: GithubIntegrationService,
    private readonly submission: ExperimentRunSubmission,
    private readonly provenanceService: ProvenanceService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.schedule(0);
    this.scheduleWatch();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.watchTimer);
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
    for (const plugin of EXPERIMENT_REQUIRED_PLUGINS) {
      const result = run.analysis
        ? await this.store.getPluginResult(run.analysis.id, plugin)
        : null;
      if (
        plugin === SBOM_PLUGIN &&
        run.grid_date &&
        isNoLockfileResult(result)
      ) {
        await this.completeEmpty(experiment, run);
        return;
      }
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

    await this.saveProbeOutcome(
      experiment,
      run,
      mapProbePackages(results.get(SBOM_PLUGIN)),
    );
    const rows = mapRunRows(results.get(SBOM_PLUGIN), results.get(VULN_PLUGIN));
    // The knowledge in use now, right after vuln-finder matched these rows
    const knowledge = await this.provenanceService.get();
    const copied = await this.store.copyRunRows(
      experiment.id,
      run.id,
      rows,
      undefined,
      knowledge,
    );
    if (!copied) {
      this.logger.warn(
        "Experiment run ended before its rows were copied",
        logContext,
      );
      return;
    }
    this.logger.log("Experiment run done", {
      ...logContext,
      dependencies: rows.summary.total_dependencies,
      vulnerabilities: rows.summary.total_vulnerabilities,
    });
  }

  /**
   * Record what the run's commit resolves, before the run is marked done so
   * a crash in between only repeats the write.
   */
  private async saveProbeOutcome(
    experiment: Experiment,
    run: ExperimentRun,
    packages: ProbePackage[],
  ): Promise<void> {
    if (!run.commit_hash) return;
    await this.store.saveProbeOutcome({
      experimentId: experiment.id,
      datasetEntryId: run.dataset_entry.id,
      commitHash: run.commit_hash,
      committedAt: run.committed_at ?? null,
      packages,
    });
  }

  /** Mark a run done with no rows: its snapshot had no lockfile yet. */
  private async completeEmpty(
    experiment: Experiment,
    run: ExperimentRun,
  ): Promise<void> {
    // A commit without a lockfile resolves nothing
    await this.saveProbeOutcome(experiment, run, []);
    const copied = await this.store.copyRunRows(
      experiment.id,
      run.id,
      mapRunRows(null, null),
      NO_LOCKFILE_YET,
    );
    if (!copied) return;
    this.logger.log("Experiment run done: no lockfile yet", {
      experimentId: experiment.id,
      runId: run.id,
      ...analysisContext(run),
    });
  }

  /** A dated snapshot whose commit had no lockfile or manifest yet. */
  private async lacksLockfile(run: ExperimentRun): Promise<boolean> {
    if (!run.analysis || !run.grid_date) return false;
    if (isNoManifestFailure(run.analysis.failure_reason)) return true;
    return isNoLockfileResult(
      await this.store.getPluginResult(run.analysis.id, SBOM_PLUGIN),
    );
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
      let probing = false;
      if (status === ExperimentStatus.CANCELLED) {
        await this.store.skipUnsubmitted(experimentId);
      } else if (status === ExperimentStatus.RUNNING) {
        const slots = await this.submit(experiment);
        await this.store.settleSharedRuns(experimentId);
        probing = await this.probe(experiment, slots);
      }
      await this.store.settleSharedRuns(experimentId);
      if (
        !probing &&
        (await this.store.countPending(experimentId)) === 0 &&
        (await this.store.getInFlightProbes(experimentId)).length === 0
      ) {
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
    await this.pollProbes(experiment);
    const now = Date.now();
    for (const run of await this.store.getInFlightRuns(experiment.id)) {
      const status = run.analysis?.status;
      const outcome = status ? analysisOutcome(status) : "running";
      if (!run.analysis) {
        await this.attemptFailed(experiment, run, "analysis deleted");
      } else if (outcome === "succeeded") {
        await this.completeRun(experiment, run);
      } else if (outcome === "failed" && (await this.lacksLockfile(run))) {
        await this.completeEmpty(experiment, run);
      } else if (outcome === "failed") {
        await this.attemptFailed(
          experiment,
          run,
          run.analysis.failure_reason ?? `analysis ${status}`,
        );
      } else if (this.pastCeiling(run, now)) {
        // Fail the run before abandoning, so a cancelled analysis is never retried
        await this.store.updateRun(run.id, {
          status: ExperimentRunStatus.FAILED,
          error: "ceiling",
          ended_on: new Date(),
        });
        await this.submission.abandon(run.analysis.id);
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

  /**
   * Submit unsubmitted runs, by entry rank then grid date, while the global
   * cap allows. Shared or commit-less snapshots take no slot.
   */
  private async submit(experiment: Experiment): Promise<number> {
    const slots = this.maxInFlight - (await this.store.countInFlight());
    if (slots <= 0) return 0;
    const runs = await this.store.getUnsubmittedRuns(
      experiment.id,
      slots * ((experiment.grid_count ?? 0) + 1),
    );
    if (runs.length === 0) return slots;

    const submitter = this.submitter(experiment);
    const client = await this.githubClient(submitter.integrationId);
    const repos: RepoLookups = new Map();

    let submitted = 0;
    for (const run of runs) {
      if (submitted >= slots) break;
      await this.store.renewLease(experiment.id, this.instanceId);
      if (await this.submitRun(experiment, run, client, repos, submitter)) {
        submitted++;
      }
    }
    return slots - submitted;
  }

  /**
   * Who submits analyses for the experiment.
   * @throws {ExperimentFatal} If the integration or the creator was removed
   */
  private submitter(experiment: Experiment): Submitter {
    const integrationId = experiment.dataset.integration?.id;
    if (!integrationId) {
      throw new ExperimentFatal(
        "The GitHub integration of this dataset was removed",
      );
    }
    if (!experiment.created_by) {
      throw new ExperimentFatal("The creator of this experiment was removed");
    }
    return {
      integrationId,
      creator: new AuthenticatedUser(
        experiment.created_by.id,
        [ROLE.USER],
        true,
      ),
    };
  }

  /**
   * List the intervals to date, then submit the next probes, fixes first.
   * @returns whether probe work remains (to list, submit or finish)
   */
  private async probe(experiment: Experiment, slots: number): Promise<boolean> {
    // A HEAD-only experiment has nothing to date
    if (!experiment.grid_count) return false;
    // Nothing can be submitted and snapshots still run: plan on a later pass
    if (slots <= 0 && (await this.store.countPending(experiment.id)) > 0) {
      return true;
    }
    let rows = await this.store.getProbeRows(experiment.id);
    let plan = planProbes(rows);
    if (plan.intervals.length === 0 && plan.probes.length === 0) {
      return plan.waiting > 0;
    }
    const submitter = this.submitter(experiment);
    const client = await this.githubClient(submitter.integrationId);
    if (plan.intervals.length > 0) {
      for (const interval of plan.intervals) {
        await this.store.renewLease(experiment.id, this.instanceId);
        await this.listInterval(experiment, client, interval);
      }
      rows = await this.store.getProbeRows(experiment.id);
      plan = planProbes(rows);
    }

    const left = await this.analysesLeft(experiment);
    const probes = plan.probes.slice(
      0,
      this.probeAllowance(plan.probes.length, slots, left),
    );
    if (probes.length > 0) {
      const entries = new Map(
        (
          await this.store.getDatasetEntries([
            ...new Set(probes.map((p) => p.entry)),
          ])
        ).map((e) => [e.id, e]),
      );
      const branches = new Map<string, string>();
      for (const run of rows.runs) {
        if (run.dataset_entry_id && run.branch)
          branches.set(run.dataset_entry_id, run.branch);
      }
      for (const request of probes) {
        const entry = entries.get(request.entry);
        const branch = branches.get(request.entry);
        if (!entry || !branch) continue;
        await this.store.renewLease(experiment.id, this.instanceId);
        await this.submitProbe(experiment, entry, branch, request, submitter);
      }
    }
    // Probes a spent budget will never submit keep nothing open
    return (
      plan.intervals.length > 0 ||
      (plan.probes.length > 0 && left > 0) ||
      plan.waiting > 0
    );
  }

  /**
   * How many of the planned probes to submit now: the one place that caps
   * them. Planned probes come fixes first, so a budget runs out on introductions.
   */
  private probeAllowance(
    planned: number,
    slots: number,
    budgetLeft: number,
  ): number {
    return Math.max(0, Math.min(planned, slots, budgetLeft));
  }

  /** Analyses the experiment's budget still allows; Infinity without one. */
  private async analysesLeft(experiment: Experiment): Promise<number> {
    const budget = experiment.analysis_budget ?? null;
    if (budget === null) return analysesLeft(null);
    return analysesLeft({
      analysis_budget: budget,
      analyses_submitted: await this.store.countSubmittedAnalyses(
        experiment.id,
      ),
    });
  }

  /**
   * List the commits that touched the lockfile after the earlier snapshot's
   * commit, up to the later one's, oldest first.
   */
  private async listInterval(
    experiment: Experiment,
    client: GithubRestClient,
    { entry, from, to }: IntervalRequest,
  ): Promise<void> {
    const interval = {
      experimentId: experiment.id,
      datasetEntryId: entry,
      fromCommit: from.commit_hash ?? null,
      toCommit: to.commit_hash!,
    };
    const lockfilePath = await this.lockfilePath(from, to);
    const [owner, repo] = await this.ownerAndRepo(entry);
    if (!lockfilePath || !owner || !repo) {
      await this.store.saveProbeInterval({
        ...interval,
        lockfilePath,
        candidates: [],
        error: lockfilePath ? "repository unknown" : "lockfile path unknown",
      });
      return;
    }
    const candidates: ProbeCandidate[] = [];
    let truncated = false;
    try {
      for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
        const commits = (
          (await client.rest.repos.listCommits({
            owner,
            repo,
            // From the later snapshot's commit, so only its ancestors are listed
            sha: interval.toCommit,
            path: lockfilePath,
            ...(from.committed_at
              ? { since: new Date(from.committed_at).toISOString() }
              : {}),
            per_page: COMMITS_PER_PAGE,
            page,
          })) as { data: GithubCommitItem[] }
        ).data;
        for (const commit of commits) {
          const date =
            commit.commit.committer?.date ?? commit.commit.author?.date;
          if (commit.sha === from.commit_hash || !date) continue;
          candidates.push({
            sha: commit.sha,
            committed_at: new Date(date).toISOString(),
          });
        }
        if (commits.length < COMMITS_PER_PAGE) break;
        truncated = page === MAX_COMMIT_PAGES;
      }
    } catch (err) {
      const classified = this.classifyGithubError(err);
      if (!(classified instanceof RunSkipped)) throw classified;
      await this.store.saveProbeInterval({
        ...interval,
        lockfilePath,
        candidates: [],
        error: classified.reason,
      });
      return;
    }
    if (truncated) {
      // A cut list could locate the wrong commit
      await this.store.saveProbeInterval({
        ...interval,
        lockfilePath,
        candidates: [],
        error: TOO_MANY_COMMITS_REASON,
      });
      this.logger.warn("Experiment probe interval has too many commits", {
        experimentId: experiment.id,
        datasetEntryId: entry,
      });
      return;
    }
    // GitHub lists newest first
    candidates.sort((a, b) => a.committed_at.localeCompare(b.committed_at));
    await this.store.saveProbeInterval({
      ...interval,
      lockfilePath,
      candidates,
      error: null,
    });
    this.logger.log("Experiment probe interval listed", {
      experimentId: experiment.id,
      datasetEntryId: entry,
      candidates: candidates.length,
    });
  }

  /** The lockfile path js-sbom found at either bracketing snapshot. */
  private async lockfilePath(
    ...runs: ResultsRunInput[]
  ): Promise<string | null> {
    for (const run of runs) {
      if (!run.analysis_id || !run.commit_hash || run.error === NO_LOCKFILE_YET)
        continue;
      const sbom = unwrapResultEnvelope(
        await this.store.getPluginResult(run.analysis_id, SBOM_PLUGIN),
      );
      const path = repoLockfilePath(sbom, run.commit_hash);
      if (path) return path;
    }
    return null;
  }

  private async ownerAndRepo(entryId: string): Promise<[string?, string?]> {
    const [entry] = await this.store.getDatasetEntries([entryId]);
    return entry ? [entry.owner, entry.repo] : [];
  }

  /** Reserve and submit one probe; a failed submission ends it failed. */
  private async submitProbe(
    experiment: Experiment,
    entry: ExperimentRun["dataset_entry"],
    branch: string,
    request: ProbeRequest,
    submitter: Submitter,
  ): Promise<void> {
    const committedAt = new Date(request.commit.committed_at);
    const probeId = await this.store.reserveProbe({
      experimentId: experiment.id,
      datasetEntryId: entry.id,
      commitHash: request.commit.sha,
      committedAt,
    });
    if (!probeId) return;
    const logContext = {
      experimentId: experiment.id,
      probeId,
      commitHash: request.commit.sha,
    };
    let analysisId: string | undefined;
    try {
      analysisId = await this.submission.submitProbe({
        experiment,
        probeId,
        entry,
        integrationId: submitter.integrationId,
        head: {
          branch,
          commitHash: request.commit.sha,
          committedAt,
          description: null,
        },
        creator: submitter.creator,
      });
    } catch (err) {
      if (err instanceof NotAuthorized) {
        throw new ExperimentFatal(
          "The creator of this experiment is no longer allowed to analyze projects of the organization",
        );
      }
      const reason = `submission failed: ${describeBuildError(err)}`;
      await this.store.failProbeSubmission(probeId, reason);
      this.logger.warn("Experiment probe submission failed", {
        ...logContext,
        reason,
      });
      return;
    }
    if (analysisId) {
      this.logger.log("Experiment probe submitted", {
        ...logContext,
        analysisId,
      });
    }
  }

  /** End probes whose analysis finished: done with their packages, or failed. */
  private async pollProbes(experiment: Experiment): Promise<void> {
    const now = Date.now();
    for (const probe of await this.store.getInFlightProbes(experiment.id)) {
      const status = probe.analysis?.status;
      const outcome = status ? analysisOutcome(status) : "running";
      if (!probe.analysis) {
        await this.failProbe(experiment, probe, "analysis deleted");
        continue;
      }
      const sbom =
        outcome === "running"
          ? null
          : await this.store.getPluginResult(probe.analysis.id, SBOM_PLUGIN);
      if (outcome === "succeeded" && isUsablePluginResult(sbom)) {
        await this.endProbeWith(experiment, probe, mapProbePackages(sbom));
      } else if (
        outcome !== "running" &&
        (isNoLockfileResult(sbom) ||
          isNoManifestFailure(probe.analysis.failure_reason))
      ) {
        // A commit without a lockfile resolves nothing
        await this.endProbeWith(experiment, probe, []);
      } else if (outcome === "succeeded") {
        await this.failProbe(
          experiment,
          probe,
          `missing result: ${SBOM_PLUGIN}`,
        );
      } else if (outcome === "failed") {
        await this.failProbe(
          experiment,
          probe,
          probe.analysis.failure_reason ?? `analysis ${status}`,
        );
      } else if (
        probe.submitted_on &&
        now - probe.submitted_on.getTime() > this.ceilingMs
      ) {
        await this.failProbe(experiment, probe, "ceiling");
        await this.submission.abandon(probe.analysis.id);
      }
    }
  }

  /** End a probe failed and say why. */
  private async failProbe(
    experiment: Experiment,
    probe: ExperimentProbe,
    reason: string,
  ): Promise<void> {
    await this.store.endProbe(probe.id, "failed", reason);
    this.logger.warn("Experiment probe failed", {
      experimentId: experiment.id,
      probeId: probe.id,
      ...(probe.analysis ? { analysisId: probe.analysis.id } : {}),
      commitHash: probe.commit_hash,
      reason,
    });
  }

  /** Write the probed commit's packages, then mark the probe done. */
  private async endProbeWith(
    experiment: Experiment,
    probe: ExperimentProbe,
    packages: ProbePackage[],
  ): Promise<void> {
    await this.store.saveProbeOutcome({
      experimentId: experiment.id,
      datasetEntryId: probe.dataset_entry.id,
      commitHash: probe.commit_hash,
      committedAt: probe.committed_at ?? null,
      packages,
    });
    await this.store.endProbe(probe.id, "done");
    this.logger.log("Experiment probe done", {
      experimentId: experiment.id,
      probeId: probe.id,
      ...(probe.analysis ? { analysisId: probe.analysis.id } : {}),
      commitHash: probe.commit_hash,
    });
  }

  /** @returns whether the run took an in-flight slot */
  private async submitRun(
    experiment: Experiment,
    run: ExperimentRun,
    client: GithubRestClient,
    repos: RepoLookups,
    submitter: Submitter,
  ): Promise<boolean> {
    const { integrationId, creator } = submitter;
    const entry = run.dataset_entry;
    const logContext = {
      experimentId: experiment.id,
      runId: run.id,
      gridDate: run.grid_date?.toISOString() ?? "HEAD",
    };

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
        head = await this.pin(client, repos, run);
      } catch (err) {
        if (err instanceof NoCommitYet) {
          await this.store.updateRun(run.id, { branch: err.branch });
          await this.completeEmpty(experiment, run);
          return false;
        }
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
        return false;
      }
    }
    const pinned = {
      branch: head.branch,
      commit_hash: head.commitHash,
      committed_at: head.committedAt,
    };

    // Another snapshot of the entry pinned the same commit: share its analysis
    const sharedRun = await this.store.findCommitRun(
      experiment.id,
      entry.id,
      head.commitHash,
      run.id,
    );
    if (sharedRun) {
      const now = new Date();
      await this.store.updateRun(run.id, {
        ...pinned,
        shared_from: { id: sharedRun.id },
        submitted_on: now,
        first_submitted_on: run.first_submitted_on ?? now,
      });
      this.logger.log("Experiment run shares an analysis", {
        ...logContext,
        sharedFromRunId: sharedRun.id,
        commitHash: head.commitHash,
      });
      return false;
    }
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
      return false;
    }

    let analysisId: string | undefined;
    try {
      analysisId = await this.submission.submit({
        experiment,
        runId: run.id,
        entry,
        integrationId,
        head,
        creator,
      });
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
      return false;
    }

    if (!analysisId) {
      this.logger.log(
        "Experiment run ended before it was submitted",
        logContext,
      );
      return false;
    }
    this.logger.log("Experiment run submitted", {
      ...logContext,
      analysisId,
      commitHash: head.commitHash,
    });
    return true;
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
   * The commit a snapshot analyzes: the last default-branch commit on or
   * before the end of its grid date, or the branch tip for HEAD.
   * @throws {RunSkipped} If the repository is gone, moved or has no branch
   * @throws {NoCommitYet} If the branch has no commit by the grid date
   * @throws {GithubRateLimited} If GitHub rate limited the request
   * @throws {ExperimentFatal} If the token is no longer accepted or allowed
   */
  private async pin(
    client: GithubRestClient,
    repos: RepoLookups,
    run: ExperimentRun,
  ): Promise<PinnedHead> {
    const entry = run.dataset_entry;
    const repo = await this.lookupRepo(client, repos, entry);
    const gridDate = run.grid_date ?? null;
    let commits: GithubCommitItem[];
    try {
      commits = (
        (await client.rest.repos.listCommits({
          owner: entry.owner,
          repo: entry.repo,
          sha: repo.branch,
          // No commit to start from at a grid date, so branch plus until is the best GitHub offers
          ...(gridDate ? { until: endOfGridDay(gridDate).toISOString() } : {}),
          per_page: 1,
        })) as { data: GithubCommitItem[] }
      ).data;
    } catch (err) {
      // An empty repository has no commit by any grid date yet
      if (gridDate && (err as GithubApiError).status === 409) {
        throw new NoCommitYet(repo.branch);
      }
      throw this.classifyGithubError(err);
    }

    const tip = commits[0];
    if (!tip && gridDate) throw new NoCommitYet(repo.branch);
    if (!tip) throw new RunSkipped(`no commits on ${repo.branch}`);
    const date = tip.commit.committer?.date ?? tip.commit.author?.date;
    return {
      branch: repo.branch,
      commitHash: tip.sha,
      committedAt: date ? new Date(date) : null,
      description: repo.description,
    };
  }

  /** The entry's repository, looked up once per pass for all its snapshots. */
  private lookupRepo(
    client: GithubRestClient,
    repos: RepoLookups,
    entry: ExperimentRun["dataset_entry"],
  ): Promise<PinnableRepo> {
    let lookup = repos.get(entry.id);
    if (!lookup) {
      lookup = this.fetchRepo(client, entry);
      repos.set(entry.id, lookup);
    }
    return lookup;
  }

  /**
   * The repository's live metadata, with its default branch.
   * @throws {RunSkipped} If the repository is gone, moved or has no branch
   */
  private async fetchRepo(
    client: GithubRestClient,
    entry: ExperimentRun["dataset_entry"],
  ): Promise<PinnableRepo> {
    let repo: GithubRepoMetadata;
    try {
      repo = (
        (await client.rest.repos.get({
          owner: entry.owner,
          repo: entry.repo,
        })) as { data: GithubRepoMetadata }
      ).data;
    } catch (err) {
      throw this.classifyGithubError(err);
    }
    if (repo.html_url.toLowerCase() !== entry.git_url.toLowerCase()) {
      throw new RunSkipped(`repository moved to ${repo.html_url}`);
    }
    if (!repo.default_branch) throw new RunSkipped("no default branch");
    return {
      branch: repo.default_branch,
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

  /** Kick a pass as soon as an in-flight analysis finishes, between ticks. */
  private async watch(): Promise<void> {
    // Skip the check while a pass runs: the pass reads the same state
    if (!this.running) {
      try {
        if (await this.store.hasFinishedInFlight()) this.kick();
      } catch (err) {
        this.logger.warn("Experiment completion check failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!this.stopped) this.scheduleWatch();
  }

  private scheduleWatch(): void {
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      void this.watch();
    }, this.watchMs);
    this.watchTimer.unref();
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
    this.timer.unref();
  }
}
