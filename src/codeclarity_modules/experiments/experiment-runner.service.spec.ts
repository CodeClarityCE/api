import { AnalysisStatus } from "src/base_modules/analyses/analysis.entity";
import type { GithubIntegrationService } from "src/base_modules/integrations/github/github.service";
import * as githubSearch from "src/base_modules/integrations/github/githubSearch";
import type {
  KnowledgeProvenance,
  ProvenanceService,
} from "src/codeclarity_modules/knowledge/provenance/provenance.service";
import { CodeClarityLogger } from "src/services/logger.service";
import { NotAuthorized } from "src/types/error.types";

import type { DatasetEntry } from "../datasets/dataset-entry.entity";

import { type Experiment, ExperimentStatus } from "./experiment.entity";
import { deriveExposures, type ExposuresInput } from "./experiment-exposures";
import type { ExperimentProbe } from "./experiment-probe.entity";
import type { ResultsRunInput } from "./experiment-results";
import type { RunRows } from "./experiment-row-copy";
import {
  type ExperimentRun,
  ExperimentRunStatus,
} from "./experiment-run.entity";
import type {
  ExperimentRunSubmission,
  ProbeSubmissionRequest,
  RunSubmissionRequest,
} from "./experiment-run-submission";
import { ExperimentRunnerService } from "./experiment-runner.service";
import {
  EXPERIMENT_LEASE_SECONDS,
  type ExperimentFinish,
  ExperimentLeaseLost,
  ExperimentStore,
  type ProbeInterval,
  type ProbeOutcome,
  type ProbeReservation,
  type RunPatch,
} from "./experiment-store";

jest.mock("src/base_modules/integrations/github/githubSearch", () => ({
  ...jest.requireActual<typeof githubSearch>(
    "src/base_modules/integrations/github/githubSearch",
  ),
  createGithubClient: jest.fn(),
}));

const NON_TERMINAL = new Set([
  ExperimentStatus.PENDING,
  ExperimentStatus.RUNNING,
]);

interface FakeAnalysis {
  id: string;
  status: AnalysisStatus;
  failure_reason?: string | null;
}

/** Plugin results as the pipeline stores them, one workspace each. */
function sbomResult(packageManager = "NPM"): unknown {
  return {
    workspaces: {
      ".": {
        dependencies: {
          lodash: { "4.17.20": { Direct: true, Prod: true } },
          minimist: { "1.2.5": { Transitive: true, Prod: true } },
        },
        start: {},
      },
    },
    analysis_info: { status: "success", package_manager: packageManager },
  };
}

function vulnResult(ids: string[] = ["CVE-2021-23337"]): unknown {
  return {
    workspaces: {
      ".": {
        Vulnerabilities: ids.map((id) => ({
          VulnerabilityId: id,
          AffectedDependency: "lodash",
          AffectedVersion: "4.17.20",
          Severity: { Severity: 7.2, SeverityClass: "HIGH" },
          Conflict: { ConflictFlag: "MATCH_CORRECT", ConflictWinner: "OSV" },
          direct_dependency: true,
        })),
      },
    },
    analysis_info: { status: "success" },
  };
}

/**
 * The store as it behaves against Postgres: leases expire with the clock,
 * run updates only apply to pending runs, copied rows are replaced per run.
 */
class FakeStore extends ExperimentStore {
  experiments = new Map<string, Experiment>();
  runs: ExperimentRun[] = [];
  analyses = new Map<string, FakeAnalysis>();
  /** Plugin results by `${analysisId}/${plugin}` */
  results = new Map<string, unknown>();
  /** Copied rows by run id */
  copied = new Map<string, RunRows & { experimentId: string }>();
  /** Probe outcome rows by `${experimentId}/${entryId}/${commit}` */
  probeOutcomes = new Map<string, ProbeOutcome>();

  async saveProbeOutcome(outcome: ProbeOutcome): Promise<void> {
    const key = `${outcome.experimentId}/${outcome.datasetEntryId}/${outcome.commitHash}`;
    this.probeOutcomes.set(key, outcome);
  }

  /** Fix probes and listed intervals, as their tables hold them */
  probes: (ProbeReservation & {
    id: string;
    status: "pending" | "done" | "failed";
    error: string | null;
    submitted_on: Date | null;
    analysis: { id: string } | null;
  })[] = [];
  intervals: ProbeInterval[] = [];

  async getProbeRows(
    experimentId: string,
  ): Promise<ExposuresInput & { runs: ResultsRunInput[] }> {
    const runs = this.runsOf(experimentId);
    const pending = new Set(
      runs.filter((r) => r.status === ExperimentRunStatus.PENDING).map((r) => r.dataset_entry.id),
    );
    const ended = runs.filter((r) => !pending.has(r.dataset_entry.id));
    const entries = new Set(ended.map((r) => r.dataset_entry.id));
    return {
      runs: ended.map((r) => ({
        status: r.status,
        error: r.error ?? null,
        grid_index: r.grid_index,
        grid_date: r.grid_date ?? null,
        commit_hash: r.commit_hash ?? null,
        committed_at: r.committed_at ?? null,
        branch: r.branch ?? null,
        analysis_id: r.analysis?.id ?? null,
        rows_run_id: r.shared_from?.id ?? r.id,
        dataset_entry_id: r.dataset_entry.id,
      })),
      vulnerabilities: ended.flatMap((r) =>
        (this.copied.get(r.id)?.vulnerabilities ?? []).map((v) => ({ ...v, run_id: r.id })),
      ),
      probes: [...this.probeOutcomes.values()]
        .filter((o) => o.experimentId === experimentId && entries.has(o.datasetEntryId))
        .map((o) => ({ dataset_entry_id: o.datasetEntryId, commit_hash: o.commitHash, packages: o.packages })),
      probe_intervals: this.intervals
        .filter((i) => i.experimentId === experimentId && entries.has(i.datasetEntryId))
        .map((i) => ({
          dataset_entry_id: i.datasetEntryId,
          from_commit: i.fromCommit,
          to_commit: i.toCommit,
          candidates: i.candidates,
          error: i.error,
        })),
      probe_analyses: this.probes
        .filter((p) => p.experimentId === experimentId && entries.has(p.datasetEntryId))
        .map((p) => ({ dataset_entry_id: p.datasetEntryId, commit_hash: p.commitHash, status: p.status, error: p.error })),
    };
  }

  async getDatasetEntries(ids: string[]): Promise<DatasetEntry[]> {
    const found = new Map(this.runs.map((r) => [r.dataset_entry.id, r.dataset_entry]));
    return ids.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
  }

  async saveProbeInterval(interval: ProbeInterval): Promise<void> {
    const exists = this.intervals.some(
      (i) =>
        i.experimentId === interval.experimentId &&
        i.datasetEntryId === interval.datasetEntryId &&
        i.fromCommit === interval.fromCommit &&
        i.toCommit === interval.toCommit,
    );
    if (!exists) this.intervals.push(interval);
  }

  async reserveProbe(probe: ProbeReservation): Promise<string | null> {
    const taken = this.probes.some(
      (p) =>
        p.experimentId === probe.experimentId &&
        p.datasetEntryId === probe.datasetEntryId &&
        p.commitHash === probe.commitHash,
    );
    if (taken) return null;
    const id = `probe-${this.probes.length + 1}`;
    this.probes.push({ ...probe, id, status: "pending", error: null, submitted_on: new Date(), analysis: null });
    return id;
  }

  async linkProbe(_manager: unknown, probeId: string, analysisId: string): Promise<boolean> {
    const probe = this.probes.find((p) => p.id === probeId);
    if (probe?.status !== "pending") return false;
    probe.analysis = { id: analysisId };
    return true;
  }

  async getInFlightProbes(experimentId: string): Promise<ExperimentProbe[]> {
    return this.probes
      .filter((p) => p.experimentId === experimentId && p.status === "pending")
      .map(
        (p) =>
          ({
            id: p.id,
            commit_hash: p.commitHash,
            committed_at: p.committedAt,
            status: p.status,
            submitted_on: p.submitted_on,
            dataset_entry: { id: p.datasetEntryId },
            analysis: p.analysis ? (this.analyses.get(p.analysis.id) ?? null) : null,
          }) as unknown as ExperimentProbe,
      );
  }

  async endProbe(probeId: string, status: "done" | "failed", error?: string): Promise<boolean> {
    const probe = this.probes.find((p) => p.id === probeId);
    if (probe?.status !== "pending") return false;
    probe.status = status;
    probe.error = error ?? null;
    return true;
  }

  async failProbeSubmission(probeId: string, error: string): Promise<void> {
    const probe = this.probes.find((p) => p.id === probeId);
    if (probe?.status !== "pending") return;
    Object.assign(probe, { status: "failed", error, submitted_on: null });
  }

  async countSubmittedAnalyses(experimentId: string): Promise<number> {
    const attempts = this.runsOf(experimentId).reduce((sum, r) => sum + r.attempts, 0);
    return attempts + this.probes.filter((p) => p.experimentId === experimentId && p.submitted_on).length;
  }

  probeOf(commit: string): FakeStore["probes"][number] | undefined {
    return this.probes.find((p) => p.commitHash === commit);
  }

  async claimNext(
    owner: string,
    exclude: string[],
  ): Promise<string | undefined> {
    const now = Date.now();
    const candidates = [...this.experiments.values()]
      .filter(
        (e) =>
          NON_TERMINAL.has(e.status) ||
          (e.status === ExperimentStatus.CANCELLED && !e.ended_on),
      )
      .filter(
        (e) =>
          !e.lease_until ||
          e.lease_until.getTime() < now ||
          e.lease_owner === owner,
      )
      .filter((e) => !exclude.includes(e.id))
      .sort((a, b) => a.created_on.getTime() - b.created_on.getTime());
    const claimed = candidates[0];
    if (!claimed) return undefined;
    claimed.lease_owner = owner;
    claimed.lease_until = new Date(now + EXPERIMENT_LEASE_SECONDS * 1000);
    return claimed.id;
  }

  async renewLease(id: string, owner: string): Promise<void> {
    const experiment = this.held(id, owner);
    experiment.lease_until = new Date(
      Date.now() + EXPERIMENT_LEASE_SECONDS * 1000,
    );
  }

  async release(id: string, owner: string, retryAt: Date): Promise<void> {
    const experiment = this.held(id, owner);
    experiment.lease_owner = null;
    experiment.lease_until = retryAt;
  }

  async getExperiment(id: string): Promise<Experiment | null> {
    const experiment = this.experiments.get(id);
    return experiment ? { ...experiment } : null;
  }

  async start(
    id: string,
    owner: string,
    patch: Pick<Experiment, "analyzer_steps" | "provenance">,
  ): Promise<void> {
    Object.assign(this.held(id, owner), {
      ...patch,
      status: ExperimentStatus.RUNNING,
      started_on: new Date(),
    });
  }

  async finish(
    id: string,
    owner: string,
    finish: ExperimentFinish,
  ): Promise<void> {
    const experiment = this.held(id, owner);
    Object.assign(experiment, {
      status: finish.status,
      error: finish.error ?? null,
      provenance: finish.provenance ?? experiment.provenance,
      ended_on: new Date(),
      lease_owner: null,
      lease_until: null,
    });
    if (finish.status === ExperimentStatus.FAILED) {
      for (const run of this.runsOf(id)) {
        if (run.status !== ExperimentRunStatus.PENDING) continue;
        run.status = ExperimentRunStatus.SKIPPED;
        run.error = `experiment failed: ${finish.error}`;
      }
    }
  }

  async getStatus(id: string): Promise<ExperimentStatus | null> {
    return this.experiments.get(id)?.status ?? null;
  }

  async cancel(id: string): Promise<boolean> {
    const experiment = this.experiments.get(id);
    if (!experiment || !NON_TERMINAL.has(experiment.status)) return false;
    experiment.status = ExperimentStatus.CANCELLED;
    await this.skipUnsubmitted(id);
    return true;
  }

  async skipUnsubmitted(id: string): Promise<void> {
    for (const run of this.runsOf(id)) {
      if (run.status === ExperimentRunStatus.PENDING && !run.submitted_on) {
        run.status = ExperimentRunStatus.SKIPPED;
        run.error = "cancelled";
        run.ended_on = new Date();
      }
    }
  }

  async getInFlightRuns(experimentId: string): Promise<ExperimentRun[]> {
    return this.runsOf(experimentId)
      .filter(
        (r) =>
          r.status === ExperimentRunStatus.PENDING &&
          r.submitted_on &&
          !r.shared_from,
      )
      .map((r) => this.withAnalysis(r));
  }

  async getUnsubmittedRuns(
    experimentId: string,
    limit: number,
  ): Promise<ExperimentRun[]> {
    return this.runsOf(experimentId)
      .filter(
        (r) => r.status === ExperimentRunStatus.PENDING && !r.submitted_on,
      )
      .sort(
        (a, b) =>
          a.dataset_entry.rank - b.dataset_entry.rank ||
          a.grid_index - b.grid_index,
      )
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async countInFlight(): Promise<number> {
    return (
      this.runs.filter(
        (r) =>
          r.status === ExperimentRunStatus.PENDING &&
          r.submitted_on &&
          !r.shared_from,
      ).length + this.probes.filter((p) => p.status === "pending").length
    );
  }

  async findCommitRun(
    experimentId: string,
    entryId: string,
    commitHash: string,
    excludeRunId: string,
  ): Promise<ExperimentRun | null> {
    const found = this.runsOf(experimentId).find(
      (r) =>
        r.id !== excludeRunId &&
        r.dataset_entry.id === entryId &&
        r.commit_hash === commitHash &&
        !r.shared_from &&
        r.status !== ExperimentRunStatus.SKIPPED,
    );
    return found ? { ...found } : null;
  }

  async settleSharedRuns(experimentId: string): Promise<void> {
    for (const run of this.runsOf(experimentId)) {
      if (run.status !== ExperimentRunStatus.PENDING || !run.shared_from) {
        continue;
      }
      const primary = this.runs.find((r) => r.id === run.shared_from!.id);
      if (!primary || primary.status === ExperimentRunStatus.PENDING) continue;
      Object.assign(run, {
        status: primary.status,
        error: primary.error ?? null,
        ended_on: primary.ended_on ?? new Date(),
        analysis: primary.analysis ?? null,
        knowledge: primary.knowledge ?? null,
      });
    }
  }

  async countPending(experimentId: string): Promise<number> {
    return this.runsOf(experimentId).filter(
      (r) => r.status === ExperimentRunStatus.PENDING,
    ).length;
  }

  async updateRun(runId: string, patch: RunPatch): Promise<boolean> {
    const run = this.runs.find((r) => r.id === runId);
    if (run?.status !== ExperimentRunStatus.PENDING) return false;
    Object.assign(run, patch);
    return true;
  }

  linkRun(): Promise<boolean> {
    throw new Error("The runner links runs through its submission");
  }

  async getPluginResult(analysisId: string, plugin: string): Promise<unknown> {
    return this.results.get(`${analysisId}/${plugin}`) ?? null;
  }

  async copyRunRows(
    experimentId: string,
    runId: string,
    rows: RunRows,
    reason?: string,
    knowledge: KnowledgeProvenance | null = null,
  ): Promise<boolean> {
    const run = this.runs.find((r) => r.id === runId);
    if (
      run?.status !== ExperimentRunStatus.PENDING &&
      run?.status !== ExperimentRunStatus.DONE
    ) {
      return false;
    }
    this.copied.set(runId, { experimentId, ...rows });
    Object.assign(run, {
      status: ExperimentRunStatus.DONE,
      error: reason ?? null,
      ended_on: run.ended_on ?? new Date(),
      knowledge,
    });
    return true;
  }

  /** The entry's run at a grid index, HEAD (the last) by default. */
  run(entryName: string, gridIndex?: number): ExperimentRun {
    const runs = this.runs.filter(
      (r) => r.dataset_entry.full_name === entryName,
    );
    const run =
      gridIndex === undefined
        ? runs[runs.length - 1]
        : runs.find((r) => r.grid_index === gridIndex);
    if (!run) throw new Error(`no run for ${entryName}`);
    return run;
  }

  analysisOf(entryName: string, gridIndex?: number): FakeAnalysis {
    const id = this.run(entryName, gridIndex).analysis?.id;
    const analysis = id ? this.analyses.get(id) : undefined;
    if (!analysis) throw new Error(`no analysis for ${entryName}`);
    return analysis;
  }

  private runsOf(experimentId: string): ExperimentRun[] {
    return this.runs.filter((r) => r.experiment.id === experimentId);
  }

  private withAnalysis(run: ExperimentRun): ExperimentRun {
    const analysis = run.analysis
      ? (this.analyses.get(run.analysis.id) ?? null)
      : null;
    return { ...run, analysis } as unknown as ExperimentRun;
  }

  private held(id: string, owner: string): Experiment {
    const experiment = this.experiments.get(id);
    if (experiment?.lease_owner !== owner) throw new ExperimentLeaseLost();
    return experiment;
  }
}

const ORG = "org-1";
const INTEGRATION = "int-1";
const CREATOR = "user-1";
const ANALYZER = "analyzer-1";

function entry(rank: number, fullName: string): DatasetEntry {
  const [owner, repo] = fullName.split("/") as [string, string];
  return {
    id: `entry-${fullName}`,
    rank,
    full_name: fullName,
    owner,
    repo,
    git_url: `https://github.com/${fullName}`,
    default_branch: "main",
    stars: 1000 - rank,
  } as DatasetEntry;
}

/** An error shaped like Octokit's RequestError. */
function githubError(
  status: number,
  message = "",
  headers: Record<string, string> = {},
): Error {
  return Object.assign(new Error(message), {
    status,
    response: { headers },
  });
}

/** A GitHub that knows some repositories, each with a default branch tip. */
class FakeGithub {
  repos = new Map<
    string,
    { html_url: string; default_branch: string; sha: string; date: string }
  >();
  getError: Error | undefined;
  commitsError: Error | undefined;
  calls = { get: 0, listCommits: 0 };

  /** Earlier default-branch commits by repository, oldest first */
  history = new Map<string, { sha: string; date: string; paths?: string[] }[]>();
  /** Every listCommits call's parameters */
  listed: Record<string, unknown>[] = [];
  /** The `until` of every listCommits call */
  untils: (string | undefined)[] = [];

  add(fullName: string, sha: string, branch = "main"): void {
    this.repos.set(fullName.toLowerCase(), {
      html_url: `https://github.com/${fullName}`,
      default_branch: branch,
      sha,
      date: "2026-11-01T10:00:00Z",
    });
  }

  /** Give a repository earlier commits, oldest first; its tip stays last. */
  addHistory(fullName: string, commits: [string, string, string[]?][]): void {
    this.history.set(
      fullName.toLowerCase(),
      commits.map(([sha, date, paths]) => ({ sha, date, ...(paths ? { paths } : {}) })),
    );
  }

  client(): githubSearch.GithubRestClient {
    return {
      rest: {
        search: { repos: jest.fn() },
        repos: {
          getContent: jest.fn(),
          get: async ({ owner, repo }: { owner: string; repo: string }) => {
            this.calls.get++;
            if (this.getError) throw this.getError;
            const found = this.repos.get(`${owner}/${repo}`.toLowerCase());
            if (!found) throw githubError(404, "Not Found");
            return {
              data: {
                html_url: found.html_url,
                full_name: found.html_url.replace("https://github.com/", ""),
                default_branch: found.default_branch,
                description: "A repository",
              },
            };
          },
          listCommits: async (params: {
            owner: string;
            repo: string;
            sha: string;
            path?: string;
            since?: string;
            until?: string;
            per_page?: number;
            page?: number;
          }) => {
            const { owner, repo, sha, path, since, until } = params;
            this.calls.listCommits++;
            if (path) this.listed.push(params);
            else this.untils.push(until);
            if (this.commitsError) throw this.commitsError;
            const key = `${owner}/${repo}`.toLowerCase();
            const found = this.repos.get(key);
            if (!found) throw githubError(404, "Not Found");
            const all = [...(this.history.get(key) ?? []), { sha: found.sha, date: found.date }];
            // A branch lists from its tip, a commit from itself
            const tip = sha === found.default_branch ? all.length - 1 : all.findIndex((c) => c.sha === sha);
            if (tip === -1) throw githubError(404, "Not Found");
            // Commits touch package-lock.json unless told otherwise
            const at = (date: string): number => Date.parse(date);
            const commits = all
              .slice(0, tip + 1)
              .filter((c) => !until || at(c.date) <= at(until))
              .filter((c) => !since || at(c.date) >= at(since))
              .filter((c) => !path || ("paths" in c ? c.paths : ["package-lock.json"]).includes(path))
              .reverse();
            const perPage = params.per_page ?? 30;
            const start = ((params.page ?? 1) - 1) * perPage;
            return {
              data: commits.slice(start, start + perPage).map((c) => ({
                sha: c.sha,
                commit: { committer: { date: c.date } },
              })),
            };
          },
        },
      },
    };
  }
}

describe("ExperimentRunnerService", () => {
  let store: FakeStore;
  let github: FakeGithub;
  let submit: jest.Mock<Promise<string | undefined>, [RunSubmissionRequest]>;
  let submitProbe: jest.Mock<Promise<string | undefined>, [ProbeSubmissionRequest]>;
  let abandon: jest.Mock<Promise<void>, [string]>;
  let getProvenance: jest.Mock;
  let getToken: jest.Mock;
  let analysisCount: number;

  function runner(): ExperimentRunnerService {
    return new ExperimentRunnerService(
      store,
      { getToken } as unknown as GithubIntegrationService,
      { submit, submitProbe, abandon } as unknown as ExperimentRunSubmission,
      { get: getProvenance } as unknown as ProvenanceService,
    );
  }

  /**
   * An experiment with one run per snapshot of every entry: `grid` dates
   * then HEAD. Without a grid it is HEAD-only, as a v1 experiment reads.
   */
  function addExperiment(
    id: string,
    names: string[],
    overrides: Partial<Experiment> = {},
    grid: string[] = [],
  ): Experiment {
    const experiment = {
      id,
      name: id,
      status: ExperimentStatus.PENDING,
      retries: 2,
      grid_interval: "month",
      grid_count: grid.length,
      created_on: new Date(Date.now() - 1000 + store.experiments.size),
      organization: { id: ORG },
      created_by: { id: CREATOR },
      dataset: { id: `ds-${id}`, integration: { id: INTEGRATION } },
      analyzer: {
        id: ANALYZER,
        steps: [
          [{ name: "js-sbom", version: "v1.0.0", config: {} }],
          [{ name: "vuln-finder", version: "v2.0.0", config: {} }],
        ],
      },
      ...overrides,
    } as unknown as Experiment;
    store.experiments.set(id, experiment);
    names.forEach((name, rank) => {
      const snapshots = [...grid.map((d) => new Date(d)), null];
      snapshots.forEach((gridDate, gridIndex) => {
        const suffix = gridDate ? `@${gridIndex}` : "";
        store.runs.push({
          id: `run-${id}-${name}${suffix}`,
          status: ExperimentRunStatus.PENDING,
          attempts: 0,
          grid_index: gridIndex,
          grid_date: gridDate,
          experiment: { id },
          dataset_entry: entry(rank, name),
        } as unknown as ExperimentRun);
      });
      if (!github.repos.has(name.toLowerCase()))
        github.add(name, `sha-${name}`);
    });
    return experiment;
  }

  function finishAnalysis(
    entryName: string,
    status: AnalysisStatus,
    failureReason?: string,
    gridIndex?: number,
  ): void {
    const analysis = store.analysisOf(entryName, gridIndex);
    analysis.status = status;
    analysis.failure_reason = failureReason ?? null;
    if (status === AnalysisStatus.SUCCESS) {
      store.results.set(`${analysis.id}/js-sbom`, sbomResult());
      store.results.set(`${analysis.id}/vuln-finder`, vulnResult());
    }
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-06T12:00:00Z") });
    delete process.env["EXPERIMENT_MAX_IN_FLIGHT"];
    delete process.env["EXPERIMENT_RUN_CEILING_HOURS"];
    store = new FakeStore();
    github = new FakeGithub();
    analysisCount = 0;
    jest
      .mocked(githubSearch.createGithubClient)
      .mockImplementation(async () => github.client());
    getToken = jest.fn().mockResolvedValue({ getToken: () => "token" });
    // Like the real submission: links only a still-pending run, else leaves nothing
    submit = jest.fn(async (request: RunSubmissionRequest) => {
      const id = `analysis-${analysisCount + 1}`;
      if (!(await store.updateRun(request.runId, { analysis: { id } }))) {
        return undefined;
      }
      analysisCount++;
      store.analyses.set(id, { id, status: AnalysisStatus.REQUESTED });
      return id;
    });
    submitProbe = jest.fn(async (request: ProbeSubmissionRequest) => {
      const id = `analysis-${analysisCount + 1}`;
      if (!(await store.linkProbe(null, request.probeId, id))) return undefined;
      analysisCount++;
      store.analyses.set(id, { id, status: AnalysisStatus.REQUESTED });
      return id;
    });
    abandon = jest.fn(async (id: string) => {
      const analysis = store.analyses.get(id);
      if (analysis) analysis.status = AnalysisStatus.CANCELLED;
    });
    getProvenance = jest.fn().mockResolvedValue({
      knowledge_sources: { nvd: "2026-11-05T00:00:00.000Z" },
      epss_rows: 10,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("pins each entry's default branch tip and submits an analysis at that SHA", async () => {
    addExperiment("exp-1", ["octo/app"]);

    await runner().tick();

    const run = store.run("octo/app");
    expect(run).toMatchObject({
      status: ExperimentRunStatus.PENDING,
      attempts: 1,
      branch: "main",
      commit_hash: "sha-octo/app",
      committed_at: new Date("2026-11-01T10:00:00Z"),
      submitted_on: new Date("2026-11-06T12:00:00Z"),
      analysis: { id: "analysis-1" },
    });
    expect(submit).toHaveBeenCalledWith({
      experiment: expect.objectContaining({ id: "exp-1" }),
      runId: run.id,
      entry: expect.objectContaining({
        git_url: "https://github.com/octo/app",
        full_name: "octo/app",
      }),
      integrationId: INTEGRATION,
      head: expect.objectContaining({
        branch: "main",
        commitHash: "sha-octo/app",
        committedAt: new Date("2026-11-01T10:00:00Z"),
      }),
      creator: expect.objectContaining({ userId: CREATOR }),
    });
  });
  it("snapshots the analyzer steps and knowledge provenance when it starts", async () => {
    addExperiment("exp-1", ["octo/app"]);

    await runner().tick();

    const experiment = store.experiments.get("exp-1")!;
    expect(experiment.status).toBe(ExperimentStatus.RUNNING);
    expect(experiment.started_on).toEqual(new Date("2026-11-06T12:00:00Z"));
    expect(experiment.analyzer_steps).toEqual([
      [{ name: "js-sbom", version: "v1.0.0" }],
      [{ name: "vuln-finder", version: "v2.0.0" }],
    ]);
    expect(experiment.provenance).toMatchObject({
      knowledge_start: {
        knowledge_sources: { nvd: "2026-11-05T00:00:00.000Z" },
        epss_rows: 10,
      },
    });
  });

  it("marks a run done when its analysis succeeds, and completes the experiment when every run is terminal", async () => {
    addExperiment("exp-1", ["octo/app", "octo/gone"]);
    github.repos.delete("octo/gone");
    const service = runner();
    await service.tick();
    finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
    getProvenance.mockResolvedValue({
      knowledge_sources: { nvd: "2026-11-06T00:00:00.000Z" },
      epss_rows: 11,
    });

    await service.tick();

    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.DONE,
      error: null,
    });
    const experiment = store.experiments.get("exp-1")!;
    expect(experiment.status).toBe(ExperimentStatus.COMPLETED);
    expect(experiment.ended_on).toBeDefined();
    expect(experiment.lease_owner).toBeNull();
    expect(experiment.provenance).toMatchObject({
      knowledge_start: { epss_rows: 10 },
      knowledge_end: { epss_rows: 11 },
    });
  });

  it("keeps at most EXPERIMENT_MAX_IN_FLIGHT analyses in flight across experiments, oldest experiment first", async () => {
    process.env["EXPERIMENT_MAX_IN_FLIGHT"] = "3";
    addExperiment("old", ["a/1", "a/2"]);
    addExperiment("new", ["b/1", "b/2"]);
    const service = runner();

    await service.tick();

    expect(submit).toHaveBeenCalledTimes(3);
    expect(store.run("a/1").submitted_on).toBeTruthy();
    expect(store.run("a/2").submitted_on).toBeTruthy();
    expect(store.run("b/1").submitted_on).toBeTruthy();
    expect(store.run("b/2").submitted_on).toBeFalsy();

    await service.tick();
    expect(submit).toHaveBeenCalledTimes(3);

    finishAnalysis("a/1", AnalysisStatus.SUCCESS);
    await service.tick();
    expect(submit).toHaveBeenCalledTimes(4);
    expect(store.run("b/2").submitted_on).toBeTruthy();
  });

  it("retries a failed analysis on the same pinned SHA, even after the branch moved", async () => {
    addExperiment("exp-1", ["octo/app"]);
    const service = runner();
    await service.tick();
    github.add("octo/app", "sha-newer");
    finishAnalysis("octo/app", AnalysisStatus.FAILED, "clone failed");

    await service.tick();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![0].head.commitHash).toBe("sha-octo/app");
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.PENDING,
      attempts: 2,
      commit_hash: "sha-octo/app",
      analysis: { id: "analysis-2" },
      error: "clone failed",
    });
  });

  it("fails a run once its attempts are exhausted", async () => {
    addExperiment("exp-1", ["octo/app"], { retries: 1 });
    const service = runner();
    await service.tick();
    finishAnalysis("octo/app", "failure" as AnalysisStatus, "js-sbom crashed");
    await service.tick();
    finishAnalysis("octo/app", "failure" as AnalysisStatus, "js-sbom crashed");

    await service.tick();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.FAILED,
      attempts: 2,
      error: "js-sbom crashed",
    });
    expect(store.experiments.get("exp-1")!.status).toBe(
      ExperimentStatus.COMPLETED,
    );
  });

  it("counts a failed submission as an attempt and retries it", async () => {
    addExperiment("exp-1", ["octo/app"], { retries: 1 });
    submit.mockRejectedValueOnce(new Error("project import failed"));
    const service = runner();

    await service.tick();
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.PENDING,
      attempts: 1,
      submitted_on: null,
      commit_hash: "sha-octo/app",
    });
    expect(store.run("octo/app").error).toMatch(/^submission failed/);

    await service.tick();
    expect(store.run("octo/app")).toMatchObject({
      attempts: 2,
      analysis: { id: "analysis-1" },
    });
  });

  it("fails a run whose analysis is not terminal after EXPERIMENT_RUN_CEILING_HOURS, without retrying it", async () => {
    process.env["EXPERIMENT_RUN_CEILING_HOURS"] = "2";
    addExperiment("exp-1", ["octo/app"]);
    const service = runner();
    await service.tick();

    jest.setSystemTime(Date.now() + 60 * 60 * 1000);
    await service.tick();
    expect(store.run("octo/app").status).toBe(ExperimentRunStatus.PENDING);

    jest.setSystemTime(Date.now() + 61 * 60 * 1000);
    await service.tick();
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.FAILED,
      error: "ceiling",
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("abandons the analysis of a run that hit the ceiling", async () => {
    process.env["EXPERIMENT_RUN_CEILING_HOURS"] = "2";
    addExperiment("exp-1", ["octo/app"]);
    const service = runner();
    await service.tick();

    jest.setSystemTime(Date.now() + 121 * 60 * 1000);
    await service.tick();

    expect(abandon).toHaveBeenCalledWith("analysis-1");
    expect(store.analysisOf("octo/app").status).toBe(AnalysisStatus.CANCELLED);
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.FAILED,
      error: "ceiling",
    });
  });

  it("does not count an attempt against a run that ended while it was submitted", async () => {
    addExperiment("exp-1", ["octo/app"]);
    submit.mockImplementationOnce(async (request) => {
      await store.updateRun(request.runId, {
        status: ExperimentRunStatus.SKIPPED,
        error: "cancelled",
      });
      return undefined;
    });

    await runner().tick();

    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.SKIPPED,
      error: "cancelled",
      attempts: 1,
    });
    expect(store.analyses.size).toBe(0);
  });

  it("measures the ceiling from the first submission, across retries", async () => {
    process.env["EXPERIMENT_RUN_CEILING_HOURS"] = "2";
    addExperiment("exp-1", ["octo/app"]);
    const service = runner();
    await service.tick();

    jest.setSystemTime(Date.now() + 90 * 60 * 1000);
    finishAnalysis("octo/app", AnalysisStatus.FAILED, "clone failed");
    await service.tick();
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.PENDING,
      attempts: 2,
    });

    jest.setSystemTime(Date.now() + 40 * 60 * 1000);
    await service.tick();

    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.FAILED,
      error: "ceiling",
    });
    expect(submit).toHaveBeenCalledTimes(2);
  });
  describe("GitHub errors", () => {
    it("pauses the whole experiment until the rate limit resets, skipping nothing", async () => {
      addExperiment("exp-1", ["octo/app", "octo/lib"]);
      const reset = Math.floor(Date.now() / 1000) + 600;
      github.getError = githubError(403, "API rate limit exceeded", {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(reset),
      });
      const service = runner();

      await service.tick();

      const experiment = store.experiments.get("exp-1")!;
      expect(experiment.status).toBe(ExperimentStatus.RUNNING);
      expect(experiment.lease_owner).toBeNull();
      expect(experiment.lease_until).toEqual(new Date(reset * 1000));
      expect(store.run("octo/app")).toMatchObject({
        status: ExperimentRunStatus.PENDING,
        attempts: 0,
      });
      expect(github.calls.get).toBe(1);

      github.getError = undefined;
      jest.setSystemTime(Date.now() + 300 * 1000);
      await service.tick();
      expect(github.calls.get).toBe(1);

      jest.setSystemTime((reset + 1) * 1000);
      await service.tick();
      expect(submit).toHaveBeenCalledTimes(2);
    });

    it("treats a 429 as a rate limit", async () => {
      addExperiment("exp-1", ["octo/app"]);
      github.commitsError = githubError(429);

      await runner().tick();

      expect(
        store.experiments.get("exp-1")!.lease_until!.getTime(),
      ).toBeGreaterThan(Date.now());
      expect(store.run("octo/app").status).toBe(ExperimentRunStatus.PENDING);
    });

    it("fails the experiment on an authentication error and skips what is left", async () => {
      addExperiment("exp-1", ["octo/app"]);
      github.getError = githubError(401, "Bad credentials");

      await runner().tick();

      const experiment = store.experiments.get("exp-1")!;
      expect(experiment.status).toBe(ExperimentStatus.FAILED);
      expect(experiment.error).toMatch(/GitHub authentication failed/);
      expect(experiment.ended_on).toBeDefined();
      expect(store.run("octo/app").status).toBe(ExperimentRunStatus.SKIPPED);
      expect(submit).not.toHaveBeenCalled();
    });

    it("records the knowledge provenance at end when the experiment fails", async () => {
      addExperiment("exp-1", ["octo/app"]);
      github.getError = githubError(401, "Bad credentials");
      getProvenance
        .mockResolvedValueOnce({ knowledge_sources: {}, epss_rows: 10 })
        .mockResolvedValueOnce({ knowledge_sources: {}, epss_rows: 11 });

      await runner().tick();

      expect(store.experiments.get("exp-1")!.provenance).toMatchObject({
        knowledge_start: { epss_rows: 10 },
        knowledge_end: { epss_rows: 11 },
      });
    });

    it("fails the experiment on a 403 that is not a rate limit (revoked scope, SSO)", async () => {
      addExperiment("exp-1", ["octo/app", "octo/lib"]);
      github.getError = githubError(
        403,
        "Resource protected by organization SAML enforcement",
      );

      await runner().tick();

      const experiment = store.experiments.get("exp-1")!;
      expect(experiment.status).toBe(ExperimentStatus.FAILED);
      expect(experiment.error).toMatch(/GitHub access denied/);
      expect(store.run("octo/app").status).toBe(ExperimentRunStatus.SKIPPED);
      expect(store.run("octo/app").error).toMatch(/^experiment failed/);
      expect(store.run("octo/lib").error).toMatch(/^experiment failed/);
      expect(submit).not.toHaveBeenCalled();
    });

    it("fails the experiment when the integration token cannot be retrieved", async () => {
      addExperiment("exp-1", ["octo/app"]);
      getToken.mockRejectedValue(new NotAuthorized());

      await runner().tick();

      expect(store.experiments.get("exp-1")!.status).toBe(
        ExperimentStatus.FAILED,
      );
    });

    it("fails the experiment when its dataset lost its integration", async () => {
      addExperiment("exp-1", ["octo/app"], {
        dataset: { id: "ds", integration: null } as Experiment["dataset"],
      });

      await runner().tick();

      expect(store.experiments.get("exp-1")).toMatchObject({
        status: ExperimentStatus.FAILED,
        error: "The GitHub integration of this dataset was removed",
      });
    });

    it("skips a run whose repository is gone, without retrying it", async () => {
      addExperiment("exp-1", ["octo/app", "octo/gone"]);
      github.repos.delete("octo/gone");
      const service = runner();

      await service.tick();
      await service.tick();

      expect(store.run("octo/gone")).toMatchObject({
        status: ExperimentRunStatus.SKIPPED,
        error: "repository or branch not found",
        attempts: 0,
      });
      expect(store.run("octo/app").status).toBe(ExperimentRunStatus.PENDING);
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it("skips a run whose repository moved", async () => {
      addExperiment("exp-1", ["octo/old"]);
      github.repos.set("octo/old", {
        html_url: "https://github.com/octo/new",
        default_branch: "main",
        sha: "sha",
        date: "2026-11-01T10:00:00Z",
      });

      await runner().tick();

      expect(store.run("octo/old")).toMatchObject({
        status: ExperimentRunStatus.SKIPPED,
        error: "repository moved to https://github.com/octo/new",
      });
    });

    it("skips a run whose default branch has no commits", async () => {
      addExperiment("exp-1", ["octo/empty"]);
      github.commitsError = githubError(409, "Git Repository is empty.");

      await runner().tick();

      expect(store.run("octo/empty")).toMatchObject({
        status: ExperimentRunStatus.SKIPPED,
        error: "empty repository",
      });
    });
  });

  it("fails the experiment when its creator may no longer analyze the org's projects", async () => {
    addExperiment("exp-1", ["octo/app"]);
    submit.mockRejectedValue(new NotAuthorized());

    await runner().tick();

    expect(store.experiments.get("exp-1")!.status).toBe(
      ExperimentStatus.FAILED,
    );
  });

  it("on cancel, skips unsubmitted runs, lets in-flight analyses finish, then ends CANCELLED", async () => {
    process.env["EXPERIMENT_MAX_IN_FLIGHT"] = "1";
    addExperiment("exp-1", ["octo/app", "octo/lib"]);
    const service = runner();
    await service.tick();

    await expect(service.cancel("exp-1")).resolves.toBe(true);
    expect(store.run("octo/lib")).toMatchObject({
      status: ExperimentRunStatus.SKIPPED,
      error: "cancelled",
    });
    await service.tick();
    expect(store.experiments.get("exp-1")!.ended_on).toBeFalsy();

    finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
    await service.tick();

    expect(store.run("octo/app").status).toBe(ExperimentRunStatus.DONE);
    const experiment = store.experiments.get("exp-1")!;
    expect(experiment.status).toBe(ExperimentStatus.CANCELLED);
    expect(experiment.ended_on).toBeDefined();
    expect(experiment.provenance).toHaveProperty("knowledge_end");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not retry an in-flight analysis that fails after cancel", async () => {
    addExperiment("exp-1", ["octo/app"]);
    const service = runner();
    await service.tick();
    await service.cancel("exp-1");
    finishAnalysis("octo/app", AnalysisStatus.FAILED, "boom");

    await service.tick();

    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.FAILED,
      error: "boom",
    });
    expect(store.experiments.get("exp-1")!.status).toBe(
      ExperimentStatus.CANCELLED,
    );
  });

  it("ends CANCELLED when cancel commits during a pass in which an analysis fails, submitting nothing more", async () => {
    process.env["EXPERIMENT_MAX_IN_FLIGHT"] = "1";
    addExperiment("exp-1", ["octo/app", "octo/lib"]);
    const service = runner();
    await service.tick();
    finishAnalysis("octo/app", AnalysisStatus.FAILED, "clone failed");
    const getInFlightRuns = store.getInFlightRuns.bind(store);
    jest
      .spyOn(store, "getInFlightRuns")
      .mockImplementationOnce(async (experimentId) => {
        await store.cancel(experimentId);
        return getInFlightRuns(experimentId);
      });

    await service.tick();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.SKIPPED,
      error: "cancelled",
    });
    const experiment = store.experiments.get("exp-1")!;
    expect(experiment.status).toBe(ExperimentStatus.CANCELLED);
    expect(experiment.ended_on).toBeTruthy();
  });

  it("links the analysis of a run submitted while cancel commits, and submits no other run", async () => {
    process.env["EXPERIMENT_MAX_IN_FLIGHT"] = "2";
    addExperiment("exp-1", ["octo/app", "octo/lib"]);
    const realSubmit = submit.getMockImplementation()!;
    submit.mockImplementationOnce(async (request) => {
      await store.cancel("exp-1");
      return realSubmit(request);
    });
    const service = runner();

    await service.tick();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.run("octo/app")).toMatchObject({
      status: ExperimentRunStatus.PENDING,
      analysis: { id: "analysis-1" },
    });
    expect(store.run("octo/lib")).toMatchObject({
      status: ExperimentRunStatus.SKIPPED,
      error: "cancelled",
    });

    finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
    await service.tick();

    expect(store.run("octo/app").status).toBe(ExperimentRunStatus.DONE);
    const experiment = store.experiments.get("exp-1")!;
    expect(experiment.status).toBe(ExperimentStatus.CANCELLED);
    expect(experiment.ended_on).toBeTruthy();
  });

  it("refuses to cancel an experiment that already ended", async () => {
    addExperiment("exp-1", [], { status: ExperimentStatus.COMPLETED });
    await expect(runner().cancel("exp-1")).resolves.toBe(false);
  });

  it("after a restart, resumes from the DB once the lease expires, without resubmitting", async () => {
    addExperiment("exp-1", ["octo/app"]);
    await runner().tick();
    // The API restarts: a new instance, nothing in memory
    const restarted = runner();
    finishAnalysis("octo/app", AnalysisStatus.SUCCESS);

    await restarted.tick();
    expect(store.run("octo/app").status).toBe(ExperimentRunStatus.PENDING);

    jest.setSystemTime(Date.now() + (EXPERIMENT_LEASE_SECONDS + 1) * 1000);
    await restarted.tick();

    expect(store.run("octo/app").status).toBe(ExperimentRunStatus.DONE);
    expect(store.experiments.get("exp-1")!.status).toBe(
      ExperimentStatus.COMPLETED,
    );
    expect(submit).toHaveBeenCalledTimes(1);
  });

  describe("row copy", () => {
    it("copies the run summary and vulnerability instances of a succeeded analysis, then marks the run done", async () => {
      addExperiment("exp-1", ["octo/app"]);
      const service = runner();
      await service.tick();
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS);

      await service.tick();

      const run = store.run("octo/app");
      expect(run).toMatchObject({
        status: ExperimentRunStatus.DONE,
        error: null,
      });
      const copied = store.copied.get(run.id)!;
      expect(copied.experimentId).toBe("exp-1");
      expect(copied.summary).toEqual({
        total_dependencies: 2,
        direct_dependencies: 1,
        transitive_dependencies: 1,
        dev_dependencies: 0,
        prod_dependencies: 2,
        package_manager: "NPM",
        total_vulnerabilities: 1,
        vulnerable_dependencies: 1,
        direct_vulnerabilities: 1,
        transitive_vulnerabilities: 0,
        n_critical: 0,
        n_high: 1,
        n_medium: 0,
        n_low: 0,
        n_none: 0,
      });
      expect(copied.vulnerabilities).toEqual([
        expect.objectContaining({
          workspace: ".",
          vulnerability_id: "CVE-2021-23337",
          affected_dependency: "lodash",
          direct_dependency: true,
        }),
      ]);
    });

    it.each([
      ["js-sbom", "missing", undefined],
      ["vuln-finder", "missing", undefined],
      ["js-sbom", "unparseable", "not json"],
      [
        "vuln-finder",
        "from a failed plugin",
        { workspaces: {}, analysis_info: { status: "failure" } },
      ],
    ])(
      "fails a run whose %s result is %s, without copying anything",
      async (plugin, _, result) => {
        addExperiment("exp-1", ["octo/app"], { retries: 0 });
        const service = runner();
        await service.tick();
        finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
        const key = `${store.analysisOf("octo/app").id}/${plugin}`;
        if (result === undefined) store.results.delete(key);
        else store.results.set(key, result);

        await service.tick();

        const run = store.run("octo/app");
        expect(run).toMatchObject({
          status: ExperimentRunStatus.FAILED,
          error: `missing result: ${plugin}`,
        });
        expect(store.copied.has(run.id)).toBe(false);
      },
    );

    it("retries a run with a missing result on the same pinned SHA", async () => {
      addExperiment("exp-1", ["octo/app"]);
      const service = runner();
      await service.tick();
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
      store.results.delete(`${store.analysisOf("octo/app").id}/vuln-finder`);

      await service.tick();

      expect(store.run("octo/app")).toMatchObject({
        status: ExperimentRunStatus.PENDING,
        attempts: 2,
        error: "missing result: vuln-finder",
        commit_hash: "sha-octo/app",
        analysis: { id: "analysis-2" },
      });
    });

    it("replaces a run's rows when it is copied again", async () => {
      addExperiment("exp-1", ["octo/app"]);
      const service = runner();
      await service.tick();
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
      const experiment = (await store.getExperiment("exp-1"))!;
      const [run] = await store.getInFlightRuns("exp-1");
      await service.completeRun(experiment, run!);
      store.results.set(
        `${run!.analysis!.id}/vuln-finder`,
        vulnResult(["CVE-1", "CVE-2"]),
      );

      await service.completeRun(experiment, run!);

      const copied = store.copied.get(run!.id)!;
      expect(copied.summary.total_vulnerabilities).toBe(2);
      expect(copied.vulnerabilities.map((v) => v.vulnerability_id)).toEqual([
        "CVE-1",
        "CVE-2",
      ]);
      expect(store.run("octo/app").status).toBe(ExperimentRunStatus.DONE);
    });
  });
  describe("snapshot grid", () => {
    const GRID = ["2025-02-01T00:00:00Z", "2025-03-15T00:00:00Z"];

    beforeEach(() => {
      github.addHistory("octo/app", [
        ["sha-jan", "2025-01-10T08:00:00Z"],
        ["sha-mar", "2025-03-15T18:30:00Z"],
      ]);
    });

    it("pins each grid date to the last default-branch commit on or before it, and HEAD to the tip", async () => {
      addExperiment("exp-1", ["octo/app"], {}, GRID);

      await runner().tick();

      expect(store.run("octo/app", 0)).toMatchObject({
        commit_hash: "sha-jan",
        committed_at: new Date("2025-01-10T08:00:00Z"),
        branch: "main",
        attempts: 1,
      });
      expect(store.run("octo/app", 1).commit_hash).toBe("sha-mar");
      expect(store.run("octo/app", 2).commit_hash).toBe("sha-octo/app");
      expect(github.untils).toEqual([
        "2025-02-01T23:59:59.999Z",
        "2025-03-15T23:59:59.999Z",
        undefined,
      ]);
      expect(submit).toHaveBeenCalledTimes(3);
      expect(
        submit.mock.calls.map(([request]) => request.head.commitHash),
      ).toEqual(["sha-jan", "sha-mar", "sha-octo/app"]);
    });

    it("looks each repository up once per pass, however many snapshots it has", async () => {
      addExperiment("exp-1", ["octo/app"], {}, GRID);

      await runner().tick();

      expect(github.calls.get).toBe(1);
    });

    it("shares one analysis and one copy of the rows between snapshots that pin the same commit", async () => {
      addExperiment("exp-1", ["octo/app"], {}, [
        "2025-04-01T00:00:00Z",
        "2025-05-01T00:00:00Z",
      ]);
      const service = runner();
      await service.tick();

      expect(submit).toHaveBeenCalledTimes(2);
      expect(store.run("octo/app", 1)).toMatchObject({
        commit_hash: "sha-mar",
        shared_from: { id: store.run("octo/app", 0).id },
        status: ExperimentRunStatus.PENDING,
      });

      finishAnalysis("octo/app", AnalysisStatus.SUCCESS, undefined, 0);
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
      await service.tick();

      const primary = store.run("octo/app", 0);
      expect(store.run("octo/app", 1)).toMatchObject({
        status: ExperimentRunStatus.DONE,
        analysis: { id: primary.analysis!.id },
      });
      expect([...store.copied.keys()].sort()).toEqual(
        [primary.id, store.run("octo/app", 2).id].sort(),
      );
      expect(store.experiments.get("exp-1")!.status).toBe(
        ExperimentStatus.COMPLETED,
      );
    });

    it("writes one probe outcome row per analysed commit, with each workspace's packages", async () => {
      addExperiment("exp-1", ["octo/app"], {}, [
        "2025-04-01T00:00:00Z",
        "2025-05-01T00:00:00Z",
      ]);
      const service = runner();
      await service.tick();
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS, undefined, 0);
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
      await service.tick();

      const entryId = store.run("octo/app").dataset_entry.id;
      expect([...store.probeOutcomes.values()]).toEqual([
        {
          experimentId: "exp-1",
          datasetEntryId: entryId,
          commitHash: "sha-mar",
          committedAt: new Date("2025-03-15T18:30:00Z"),
          packages: [
            { workspace: ".", name: "lodash", version: "4.17.20", direct: true },
            { workspace: ".", name: "minimist", version: "1.2.5", direct: false },
          ],
        },
        expect.objectContaining({ commitHash: "sha-octo/app" }),
      ]);
    });

    it("writes an empty probe outcome row for a commit without a lockfile, and none before the first commit", async () => {
      addExperiment("exp-1", ["octo/app"], {}, [
        "2024-12-01T00:00:00Z",
        "2025-02-01T00:00:00Z",
      ]);
      const service = runner();
      await service.tick();

      const analysis = store.analysisOf("octo/app", 1);
      analysis.status = AnalysisStatus.FAILED;
      store.results.set(`${analysis.id}/js-sbom`, {
        workspaces: {},
        analysis_info: {
          status: "failure",
          errors: [{ private_error: { description: "no lock file found" } }],
        },
      });
      await service.tick();

      expect(store.run("octo/app", 1).error).toBe("no_lockfile_yet");
      expect([...store.probeOutcomes.values()]).toEqual([
        expect.objectContaining({ commitHash: "sha-jan", packages: [] }),
      ]);
    });

    it("counts one in-flight analysis per commit against the cap, not one per snapshot", async () => {
      process.env["EXPERIMENT_MAX_IN_FLIGHT"] = "2";
      addExperiment("exp-1", ["octo/app"], {}, [
        "2025-04-01T00:00:00Z",
        "2025-05-01T00:00:00Z",
        "2025-06-01T00:00:00Z",
      ]);
      const service = runner();

      await service.tick();
      await service.tick();

      expect(submit).toHaveBeenCalledTimes(2);
      expect(store.run("octo/app").submitted_on).toBeTruthy();
    });

    it("fails snapshots sharing a commit together when its analysis fails", async () => {
      addExperiment("exp-1", ["octo/app"], { retries: 0 }, [
        "2025-04-01T00:00:00Z",
        "2025-05-01T00:00:00Z",
      ]);
      const service = runner();
      await service.tick();

      finishAnalysis("octo/app", AnalysisStatus.FAILED, "clone failed", 0);
      await service.tick();

      for (const gridIndex of [0, 1]) {
        expect(store.run("octo/app", gridIndex)).toMatchObject({
          status: ExperimentRunStatus.FAILED,
          error: "clone failed",
        });
      }
    });

    it("ends a snapshot from before the repository's first commit as done and empty, with reason no_lockfile_yet", async () => {
      addExperiment("exp-1", ["octo/app"], {}, ["2024-12-01T00:00:00Z"]);

      await runner().tick();

      const run = store.run("octo/app", 0);
      expect(run).toMatchObject({
        status: ExperimentRunStatus.DONE,
        error: "no_lockfile_yet",
      });
      expect(run.analysis).toBeFalsy();
      expect(store.copied.get(run.id)).toMatchObject({
        summary: { total_dependencies: 0, total_vulnerabilities: 0 },
        vulnerabilities: [],
      });
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it("ends a snapshot whose commit has no lockfile yet as done and empty, without retrying it", async () => {
      addExperiment("exp-1", ["octo/app"], {}, ["2025-02-01T00:00:00Z"]);
      const service = runner();
      await service.tick();

      const analysis = store.analysisOf("octo/app", 0);
      analysis.status = AnalysisStatus.FAILED;
      store.results.set(`${analysis.id}/js-sbom`, {
        workspaces: {},
        analysis_info: {
          status: "failure",
          errors: [
            {
              public_error: { description: "Unable to parse package file" },
              private_error: {
                description:
                  "Unable to parse package file, error: no lock file found",
              },
            },
          ],
        },
      });
      await service.tick();

      const run = store.run("octo/app", 0);
      expect(run).toMatchObject({
        status: ExperimentRunStatus.DONE,
        error: "no_lockfile_yet",
        attempts: 1,
      });
      expect(store.copied.get(run.id)?.vulnerabilities).toEqual([]);
      expect(submit).toHaveBeenCalledTimes(2);
    });

    it("ends a snapshot of a repository that is still empty as done with reason no_lockfile_yet", async () => {
      addExperiment("exp-1", ["octo/app"], {}, ["2025-02-01T00:00:00Z"]);
      github.commitsError = githubError(409, "Git Repository is empty.");

      await runner().tick();

      expect(store.run("octo/app", 0)).toMatchObject({
        status: ExperimentRunStatus.DONE,
        error: "no_lockfile_yet",
      });
      expect(store.run("octo/app")).toMatchObject({
        status: ExperimentRunStatus.SKIPPED,
        error: "empty repository",
      });
    });

    it("keeps a HEAD analysis without a lockfile a failed attempt, as before grids", async () => {
      addExperiment("exp-1", ["octo/app"], { retries: 0 });
      const service = runner();
      await service.tick();

      const analysis = store.analysisOf("octo/app");
      analysis.status = AnalysisStatus.FAILED;
      analysis.failure_reason = "js-sbom failed";
      store.results.set(`${analysis.id}/js-sbom`, {
        workspaces: {},
        analysis_info: {
          status: "failure",
          errors: [{ private_error: { description: "no lock file found" } }],
        },
      });
      await service.tick();

      expect(store.run("octo/app")).toMatchObject({
        status: ExperimentRunStatus.FAILED,
        error: "js-sbom failed",
      });
      expect(store.copied.size).toBe(0);
    });

    it("skips every snapshot of a missing repository with a reason, and carries on with other entries", async () => {
      addExperiment("exp-1", ["octo/gone", "octo/app"], {}, GRID);
      github.repos.delete("octo/gone");

      await runner().tick();

      for (const gridIndex of [0, 1, 2]) {
        expect(store.run("octo/gone", gridIndex)).toMatchObject({
          status: ExperimentRunStatus.SKIPPED,
          error: "repository or branch not found",
        });
      }
      expect(store.run("octo/app", 0).commit_hash).toBe("sha-jan");
      expect(submit).toHaveBeenCalledTimes(3);
    });

    it("runs a HEAD-only (v1) experiment as one snapshot per entry at the tip", async () => {
      addExperiment("exp-1", ["octo/app"]);

      await runner().tick();

      expect(store.runs).toHaveLength(1);
      expect(store.run("octo/app")).toMatchObject({
        grid_index: 0,
        grid_date: null,
        commit_hash: "sha-octo/app",
      });
      expect(github.untils).toEqual([undefined]);
    });
  });

  describe("knowledge provenance per run", () => {
    const KNOWLEDGE_A = {
      knowledge_sources: { nvd: "2026-11-05T00:00:00.000Z" },
      epss_rows: 10,
    };
    const KNOWLEDGE_B = {
      knowledge_sources: { nvd: "2026-11-06T00:00:00.000Z" },
      epss_rows: 12,
    };

    it("records on each done run the knowledge in use when its rows were copied", async () => {
      addExperiment("exp-1", ["octo/app", "octo/lib"]);
      const service = runner();
      await service.tick();

      getProvenance.mockResolvedValue(KNOWLEDGE_A);
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
      await service.tick();
      getProvenance.mockResolvedValue(KNOWLEDGE_B);
      finishAnalysis("octo/lib", AnalysisStatus.SUCCESS);
      await service.tick();

      expect(store.run("octo/app").knowledge).toEqual(KNOWLEDGE_A);
      expect(store.run("octo/lib").knowledge).toEqual(KNOWLEDGE_B);
    });

    it("gives a shared run its owner's knowledge, since it reads the owner's rows", async () => {
      github.addHistory("octo/app", [["sha-mar", "2025-03-15T18:30:00Z"]]);
      addExperiment("exp-1", ["octo/app"], {}, [
        "2025-04-01T00:00:00Z",
        "2025-05-01T00:00:00Z",
      ]);
      const service = runner();
      await service.tick();

      getProvenance.mockResolvedValue(KNOWLEDGE_A);
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS, undefined, 0);
      await service.tick();
      getProvenance.mockResolvedValue(KNOWLEDGE_B);
      finishAnalysis("octo/app", AnalysisStatus.SUCCESS);
      await service.tick();

      expect(store.run("octo/app", 1)).toMatchObject({
        status: ExperimentRunStatus.DONE,
        knowledge: KNOWLEDGE_A,
      });
      expect(store.run("octo/app").knowledge).toEqual(KNOWLEDGE_B);
    });

    it("records no knowledge on a snapshot that was empty, since nothing was matched", async () => {
      addExperiment("exp-1", ["octo/app"], {}, ["2024-12-01T00:00:00Z"]);

      await runner().tick();

      expect(store.run("octo/app", 0)).toMatchObject({
        status: ExperimentRunStatus.DONE,
        error: "no_lockfile_yet",
        knowledge: null,
      });
    });
  });

  describe("fix probes", () => {
    const GRID = ["2025-03-01T00:00:00Z", "2025-04-01T00:00:00Z"];
    /** lodash at each commit; CVE-A is fixed in 4.17.21, CVE-B in 4.17.16 */
    const LODASH: Record<string, string> = {
      c3d: "4.17.15",
      d4e: "4.17.16",
      e5f: "4.17.21",
      f6a: "4.17.21",
      "sha-octo/app": "4.17.21",
    };
    const FIXED: Record<string, [number, number, number]> = {
      "CVE-A": [4, 17, 21],
      "CVE-B": [4, 17, 16],
    };

    function lodashSbom(sha: string): unknown {
      return {
        workspaces: {
          ".": {
            dependencies: { lodash: { [LODASH[sha]!]: { Direct: true, Prod: true } } },
            start: {},
          },
        },
        analysis_info: {
          status: "success",
          package_manager: "NPM",
          paths: { relative_lock_file_path: `${sha}/package-lock.json` },
        },
      };
    }

    function lodashVulns(sha: string): unknown {
      const version = LODASH[sha]!;
      const [, minor, patch] = version.split(".").map(Number) as [number, number, number];
      const ids = Object.entries(FIXED)
        .filter(([, [, fMinor, fPatch]]) => minor < fMinor || (minor === fMinor && patch < fPatch))
        .map(([id]) => id);
      return {
        workspaces: {
          ".": {
            Vulnerabilities: ids.map((id) => {
              const [Major, Minor, Patch] = FIXED[id]!;
              return {
                VulnerabilityId: id,
                AffectedDependency: "lodash",
                AffectedVersion: version,
                Severity: { SeverityClass: "HIGH" },
                Conflict: { ConflictFlag: "MATCH_CORRECT", ConflictWinner: "OSV" },
                direct_dependency: true,
                OSVMatch: {
                  Vulnerable: true,
                  Vulnerability: { published: "2025-02-01T00:00:00Z" },
                  AffectedInfo: [{ Ranges: [{ FixedSemver: { Major, Minor, Patch } }] }],
                },
              };
            }),
          },
        },
        analysis_info: { status: "success" },
      };
    }

    /** Finish every requested analysis at its commit; `failing` probes fail. */
    function settle(failing: Record<string, string> = {}): void {
      const commits = new Map<string, string>();
      for (const run of store.runs) {
        if (run.analysis && run.commit_hash) commits.set(run.analysis.id, run.commit_hash);
      }
      for (const probe of store.probes) {
        if (probe.analysis) commits.set(probe.analysis.id, probe.commitHash);
      }
      for (const analysis of store.analyses.values()) {
        const sha = commits.get(analysis.id);
        if (analysis.status !== AnalysisStatus.REQUESTED || !sha) continue;
        const isProbe = store.probes.some((p) => p.analysis?.id === analysis.id);
        if (isProbe && failing[sha]) {
          analysis.status = AnalysisStatus.FAILED;
          analysis.failure_reason = failing[sha];
          continue;
        }
        analysis.status = AnalysisStatus.SUCCESS;
        store.results.set(`${analysis.id}/js-sbom`, lodashSbom(sha));
        if (!isProbe) store.results.set(`${analysis.id}/vuln-finder`, lodashVulns(sha));
      }
    }

    async function runToEnd(failing: Record<string, string> = {}, service = runner()): Promise<void> {
      for (let pass = 0; pass < 12; pass++) {
        await service.tick();
        if (store.experiments.get("exp-1")!.status === ExperimentStatus.COMPLETED) return;
        settle(failing);
      }
      throw new Error("experiment did not complete");
    }

    async function fixes(): Promise<[string, unknown][]> {
      const rows = await store.getProbeRows("exp-1");
      return deriveExposures(rows).map((e) => [e.vulnerability_id, e.fix]);
    }

    beforeEach(() => {
      github.addHistory("octo/app", [
        ["c3d", "2025-02-25T12:00:00Z"],
        ["d4e", "2025-03-12T12:00:00Z"],
        ["e5f", "2025-03-20T12:00:00Z"],
        ["f6a", "2025-03-28T12:00:00Z"],
      ]);
      addExperiment("exp-1", ["octo/app"], {}, GRID);
    });

    it("halves over the lockfile-touching commits between two snapshots, probing each commit once for several fixes", async () => {
      await runToEnd();

      // Candidates d4e, e5f, f6a: f6a is the later snapshot, never probed
      expect(submitProbe.mock.calls.map(([request]) => request.head.commitHash)).toEqual(["d4e", "e5f"]);
      expect(submitProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          probeId: store.probeOf("d4e")!.id,
          head: expect.objectContaining({ branch: "main", commitHash: "d4e" }),
          entry: expect.objectContaining({ full_name: "octo/app" }),
        }),
      );
      expect(github.listed).toEqual([
        expect.objectContaining({ path: "package-lock.json", sha: "f6a", since: "2025-02-25T12:00:00.000Z" }),
      ]);
      expect(github.listed[0]).not.toHaveProperty("until");
      expect(await fixes()).toEqual([
        ["CVE-A", expect.objectContaining({ commit_hash: "e5f", precision: "commit", probe_outcome: "found", interval_to: "2025-04-01" })],
        ["CVE-B", expect.objectContaining({ commit_hash: "d4e", precision: "commit", probe_outcome: "found" })],
      ]);
      expect(store.probes.map((p) => p.status)).toEqual(["done", "done"]);
    });

    it("probes only after an entry's snapshots have all ended", async () => {
      const service = runner();
      await service.tick();
      settle();
      await service.tick();

      expect(store.runs.every((r) => r.status === ExperimentRunStatus.DONE)).toBe(true);
      expect(submitProbe).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledTimes(3);
    });

    it("ends the searches a failed probe was part of as not_found, and probes nothing more for them", async () => {
      await runToEnd({ d4e: "clone failed" });

      expect(submitProbe).toHaveBeenCalledTimes(1);
      expect(store.probeOf("d4e")).toMatchObject({ status: "failed", error: "clone failed" });
      expect(await fixes()).toEqual([
        ["CVE-A", expect.objectContaining({ precision: "snapshot", probe_outcome: "not_found", probe_reason: "probe of d4e failed: clone failed" })],
        ["CVE-B", expect.objectContaining({ precision: "snapshot", probe_outcome: "not_found" })],
      ]);
    });

    it("ends a search not_found when the interval has more lockfile commits than it lists", async () => {
      const many = Array.from({ length: 1000 }, (_, i): [string, string] => [
        `m${i}`,
        new Date(Date.parse("2025-03-02T00:00:00Z") + i * 60_000).toISOString(),
      ]);
      github.addHistory("octo/app", [["c3d", "2025-02-25T12:00:00Z"], ...many, ["f6a", "2025-03-28T12:00:00Z"]]);
      await runToEnd();

      expect(submitProbe).not.toHaveBeenCalled();
      expect(await fixes()).toEqual([
        ["CVE-A", expect.objectContaining({ precision: "snapshot", probe_outcome: "not_found", probe_reason: "too many commits" })],
        ["CVE-B", expect.objectContaining({ precision: "snapshot", probe_outcome: "not_found", probe_reason: "too many commits" })],
      ]);
    });

    it("logs each probe that ends failed at warn, with its experiment, probe and analysis", async () => {
      const warn = jest.spyOn(CodeClarityLogger.prototype, "warn");
      await runToEnd({ d4e: "clone failed" });

      const probe = store.probeOf("d4e")!;
      expect(warn).toHaveBeenCalledWith(
        "Experiment probe failed",
        expect.objectContaining({ experimentId: "exp-1", probeId: probe.id, analysisId: probe.analysis!.id, reason: "clone failed" }),
      );
      warn.mockRestore();
    });

    it("logs a probe whose analysis was deleted at warn", async () => {
      const service = runner();
      for (let pass = 0; pass < 6 && submitProbe.mock.calls.length === 0; pass++) {
        await service.tick();
        settle();
      }
      const probe = store.probes[0]!;
      store.analyses.delete(probe.analysis!.id);
      const warn = jest.spyOn(CodeClarityLogger.prototype, "warn");
      await service.tick();

      expect(probe).toMatchObject({ status: "failed", error: "analysis deleted" });
      expect(warn).toHaveBeenCalledWith(
        "Experiment probe failed",
        expect.objectContaining({ experimentId: "exp-1", probeId: probe.id, reason: "analysis deleted" }),
      );
      warn.mockRestore();
    });

    it("counts probes in flight against the global cap", async () => {
      process.env["EXPERIMENT_MAX_IN_FLIGHT"] = "1";
      const service = runner();
      for (let pass = 0; pass < 6; pass++) {
        await service.tick();
        if (submitProbe.mock.calls.length > 0) break;
        settle();
      }
      // The probe in flight holds the only slot
      await service.tick();

      expect(await store.countInFlight()).toBe(1);
      expect(store.probes).toHaveLength(1);
    });

    describe("under an analysis budget", () => {
      function budgeted(budget: number): void {
        store.experiments.get("exp-1")!.analysis_budget = budget;
      }

      async function budgetedFixes(): Promise<[string, unknown][]> {
        const rows = await store.getProbeRows("exp-1");
        const budget = {
          analysis_budget: store.experiments.get("exp-1")!.analysis_budget ?? null,
          analyses_submitted: await store.countSubmittedAnalyses("exp-1"),
        };
        return deriveExposures({ ...rows, budget }).map((e) => [e.vulnerability_id, e.fix]);
      }

      it("stops probing once snapshots and probes have spent the budget, then completes", async () => {
        // Three snapshot analyses and one probe
        budgeted(4);
        await runToEnd();

        expect(submit).toHaveBeenCalledTimes(3);
        expect(submitProbe.mock.calls.map(([request]) => request.head.commitHash)).toEqual(["d4e"]);
        expect(await budgetedFixes()).toEqual([
          ["CVE-A", expect.objectContaining({ commit_hash: "f6a", precision: "snapshot", probe_outcome: "not_found", probe_reason: "budget spent" })],
          ["CVE-B", expect.objectContaining({ commit_hash: "d4e", precision: "commit", probe_outcome: "found" })],
        ]);
      });

      it("never cuts snapshots: every snapshot runs on a budget below their count, and nothing is probed", async () => {
        budgeted(2);
        await runToEnd();

        expect(submit).toHaveBeenCalledTimes(3);
        expect(store.runs.every((r) => r.status === ExperimentRunStatus.DONE)).toBe(true);
        expect(submitProbe).not.toHaveBeenCalled();
        expect((await budgetedFixes()).map(([, fix]) => fix)).toEqual([
          expect.objectContaining({ precision: "snapshot", probe_reason: "budget spent" }),
          expect.objectContaining({ precision: "snapshot", probe_reason: "budget spent" }),
        ]);
      });

      it("counts every snapshot attempt against the budget, retries included", async () => {
        budgeted(4);
        const service = runner();
        await service.tick();
        finishAnalysis("octo/app", AnalysisStatus.FAILED, "clone failed", 0);
        await runToEnd({}, service);

        expect(submit).toHaveBeenCalledTimes(4);
        expect(submitProbe).not.toHaveBeenCalled();
      });

      it("does not count a probe whose submission failed against the budget", async () => {
        Object.assign(LODASH, { w1a: "4.17.21", w2b: "4.17.15", w3c: "4.17.15", "sha-octo/web": "4.17.15" });
        github.addHistory("octo/web", [
          ["w1a", "2025-02-20T12:00:00Z"],
          ["w2b", "2025-03-10T12:00:00Z"],
          ["w3c", "2025-03-25T12:00:00Z"],
        ]);
        store.experiments.delete("exp-1");
        store.runs = [];
        addExperiment("exp-1", ["octo/web", "octo/app"], {}, GRID);
        // Six snapshot analyses and one probe
        budgeted(7);
        submitProbe.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        await runToEnd();

        expect(store.probeOf("d4e")).toMatchObject({ status: "failed" });
        expect(submitProbe.mock.calls.map(([request]) => request.head.commitHash)).toEqual(["d4e", "w2b"]);
        expect(await store.countSubmittedAnalyses("exp-1")).toBe(7);
      });

      it("probes fixes before introductions", async () => {
        // octo/web gains vulnerable lodash between its first two snapshots
        Object.assign(LODASH, { w1a: "4.17.21", w2b: "4.17.15", w3c: "4.17.15", "sha-octo/web": "4.17.15" });
        github.addHistory("octo/web", [
          ["w1a", "2025-02-20T12:00:00Z"],
          ["w2b", "2025-03-10T12:00:00Z"],
          ["w3c", "2025-03-25T12:00:00Z"],
        ]);
        store.experiments.delete("exp-1");
        store.runs = [];
        addExperiment("exp-1", ["octo/web", "octo/app"], {}, GRID);
        // Six snapshot analyses and one probe
        budgeted(7);
        await runToEnd();

        expect(submitProbe.mock.calls.map(([request]) => request.head.commitHash)).toEqual(["d4e"]);
        const rows = await store.getProbeRows("exp-1");
        const intros = deriveExposures({
          ...rows,
          budget: { analysis_budget: 7, analyses_submitted: await store.countSubmittedAnalyses("exp-1") },
        }).flatMap((e) => (e.introduction ? [e.introduction] : []));
        expect(intros).toEqual([
          expect.objectContaining({ commit_hash: "w3c", precision: "snapshot", probe_reason: "budget spent" }),
          expect.objectContaining({ commit_hash: "w3c", precision: "snapshot", probe_reason: "budget spent" }),
        ]);
      });
    });

    it("does not probe once the experiment is cancelled, and ends when its probes finish", async () => {
      const service = runner();
      await service.tick();
      settle();
      await service.tick();
      expect(submitProbe).toHaveBeenCalledTimes(1);

      await service.cancel("exp-1");
      await service.tick();
      expect(store.experiments.get("exp-1")!.ended_on).toBeFalsy();
      settle();
      await service.tick();

      expect(submitProbe).toHaveBeenCalledTimes(1);
      expect(store.experiments.get("exp-1")).toMatchObject({ status: ExperimentStatus.CANCELLED });
      expect(store.experiments.get("exp-1")!.ended_on).toBeTruthy();
    });
  });
});
