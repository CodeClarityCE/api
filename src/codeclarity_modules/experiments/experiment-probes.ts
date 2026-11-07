/**
 * Fix probes (ADR 0005): date a fix or an introduction to a commit by
 * halving over the lockfile-touching commits between its two bracketing
 * snapshots. The same search runs on read (dating from stored outcomes) and
 * in the runner (which commit to probe next). Pure: no Nest or TypeORM.
 */
import type { ResultsRunInput, ResultsVulnerabilityInput } from "./experiment-results";
import type { ProbePackage } from "./experiment-row-copy";
import { isVulnerableVersion } from "./experiment-vulnerable-versions";

export const PROBE_OUTCOMES = ["found", "ambiguous", "not_found"] as const;
export type ProbeOutcomeKind = (typeof PROBE_OUTCOMES)[number];

/** A commit that touched the lockfile, as GitHub listed it. */
export interface ProbeCandidate {
  sha: string;
  /** ISO 8601 commit date */
  committed_at: string;
}

/**
 * The lockfile-touching commits after `from_commit` up to `to_commit`
 * (inclusive), oldest first. A null `from_commit` means from the first commit.
 */
export interface ResultsProbeIntervalInput {
  dataset_entry_id: string;
  from_commit: string | null;
  to_commit: string;
  candidates: ProbeCandidate[];
  /** Why the commits could not be listed, null when they were */
  error: string | null;
}

/** A probe analysis of one commit: pending, done or failed. */
export interface ResultsProbeAnalysisInput {
  dataset_entry_id: string;
  commit_hash: string;
  status: string;
  error: string | null;
}

/** Rows the probe search reads, besides the snapshot runs and instances. */
export interface ProbeRows {
  runs: readonly ResultsRunInput[];
  vulnerabilities: readonly ResultsVulnerabilityInput[];
  probes?: readonly { dataset_entry_id: string; commit_hash: string; packages: ProbePackage[] }[];
  probe_intervals?: readonly ResultsProbeIntervalInput[];
  probe_analyses?: readonly ResultsProbeAnalysisInput[];
}

/** One event to date: the change of one (vulnerability, package) between two snapshots. */
export interface DatingTask {
  entry: string;
  kind: "fix" | "introduction";
  vulnerability_id: string;
  pkg: string;
  /** The bracketing snapshots: the state changes after `before`, by `after` */
  before: ResultsRunInput;
  after: ResultsRunInput;
}

/** How an event was dated by probes, or null while the search is unfinished. */
export interface ProbeDating {
  outcome: ProbeOutcomeKind;
  reason: string | null;
  /** The located commit, when found */
  commit: ProbeCandidate | null;
  /** Packages either side of the located commit; null for the bracketing snapshot */
  packages_before: ProbePackage[] | null;
  packages_after: ProbePackage[] | null;
}

/** A commit the runner should analyse next, or an interval it should list. */
export interface ProbeRequest {
  entry: string;
  commit: ProbeCandidate;
}

export interface IntervalRequest {
  entry: string;
  from: ResultsRunInput;
  to: ResultsRunInput;
}

export const AMBIGUOUS_REASON = "a known commit in the interval contradicts a single boundary";
export const NO_CANDIDATES_REASON = "no lockfile-touching commit in the interval";

type CommitState =
  | { state: "present" | "absent"; packages: ProbePackage[] }
  | { state: "failed"; reason: string }
  | { state: "pending" | "unknown" };

type SearchStep =
  | { step: "list" }
  | { step: "probe"; commit: ProbeCandidate }
  | { step: "wait" }
  | { step: "done"; dating: ProbeDating };

const SEP = "\u0000";

/**
 * Runs the halving search for each task, against what is known so far:
 * probe outcome rows (snapshot or probe commits), failed analyses and
 * listed intervals. Records what the search still needs.
 */
export class ProbeSearch {
  private readonly packagesAt = new Map<string, ProbePackage[]>();
  private readonly failedAt = new Map<string, string>();
  private readonly pendingAt = new Set<string>();
  private readonly intervals = new Map<string, ResultsProbeIntervalInput>();
  private readonly versions = new Map<string, { ranges: NonNullable<ResultsVulnerabilityInput["vulnerable_versions"]> | null; seen: Set<string> }>();

  /** Requests in the order tasks were searched */
  readonly probeRequests: { task: DatingTask; commit: ProbeCandidate }[] = [];
  readonly intervalRequests: { task: DatingTask }[] = [];
  waiting = 0;

  constructor(rows: ProbeRows) {
    for (const probe of rows.probes ?? []) {
      this.packagesAt.set(`${probe.dataset_entry_id}${SEP}${probe.commit_hash}`, probe.packages);
    }
    for (const run of rows.runs) {
      if (run.status === "failed" && run.dataset_entry_id && run.commit_hash) {
        this.failedAt.set(`${run.dataset_entry_id}${SEP}${run.commit_hash}`, run.error ?? "analysis failed");
      }
    }
    for (const analysis of rows.probe_analyses ?? []) {
      const key = `${analysis.dataset_entry_id}${SEP}${analysis.commit_hash}`;
      if (analysis.status === "failed") this.failedAt.set(key, analysis.error ?? "analysis failed");
      else if (analysis.status === "pending") this.pendingAt.add(key);
    }
    for (const interval of rows.probe_intervals ?? []) {
      this.intervals.set(intervalKey(interval.dataset_entry_id, interval.from_commit, interval.to_commit), interval);
    }
    for (const v of rows.vulnerabilities) {
      if (!v.vulnerability_id || !v.affected_dependency) continue;
      const key = `${v.vulnerability_id}${SEP}${v.affected_dependency}`;
      const known = this.versions.get(key) ?? { ranges: null, seen: new Set<string>() };
      known.ranges ??= v.vulnerable_versions ?? null;
      if (v.affected_version) known.seen.add(v.affected_version);
      this.versions.set(key, known);
    }
  }

  /** Date one event, or null while the search needs more probes. */
  date(task: DatingTask): ProbeDating | null {
    const step = this.search(task);
    if (step.step === "done") return step.dating;
    if (step.step === "probe") this.probeRequests.push({ task, commit: step.commit });
    else if (step.step === "list") this.intervalRequests.push({ task });
    else this.waiting++;
    return null;
  }

  private search(task: DatingTask): SearchStep {
    const to = task.after.commit_hash;
    if (!to) return notFound("the later snapshot has no commit");
    const interval = this.intervals.get(intervalKey(task.entry, task.before.commit_hash ?? null, to));
    if (!interval) return { step: "list" };
    if (interval.error) return notFound(interval.error);
    const candidates = interval.candidates;
    if (candidates.length === 0) return notFound(NO_CANDIDATES_REASON);

    const afterPresent = task.kind === "introduction";
    // The last candidate is never probed: it resolves as the later snapshot
    let lo = -1;
    let hi = candidates.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const commit = candidates[mid]!;
      const known = this.stateAt(task, commit.sha);
      if (known.state === "failed") {
        return notFound(`probe of ${commit.sha.slice(0, 7)} failed: ${known.reason}`);
      }
      if (known.state === "pending") return { step: "wait" };
      if (known.state === "unknown") return { step: "probe", commit };
      if ((known.state === "present") === afterPresent) hi = mid;
      else lo = mid;
    }

    // Every known commit before the boundary must read as before, the rest as after
    for (const [i, commit] of candidates.entries()) {
      const known = this.stateAt(task, commit.sha);
      if (known.state !== "present" && known.state !== "absent") continue;
      if ((known.state === "present") !== (i >= hi ? afterPresent : !afterPresent)) {
        return { step: "done", dating: { outcome: "ambiguous", reason: AMBIGUOUS_REASON, commit: null, packages_before: null, packages_after: null } };
      }
    }
    const packagesOf = (i: number): ProbePackage[] | null => {
      const known = this.stateAt(task, candidates[i]!.sha);
      return "packages" in known ? known.packages : null;
    };
    return {
      step: "done",
      dating: {
        outcome: "found",
        reason: null,
        commit: candidates[hi]!,
        packages_before: lo >= 0 ? packagesOf(lo) : null,
        packages_after: packagesOf(hi),
      },
    };
  }

  private stateAt(task: DatingTask, sha: string): CommitState {
    const key = `${task.entry}${SEP}${sha}`;
    const packages = this.packagesAt.get(key);
    if (packages) {
      return { state: this.isPresent(task, packages) ? "present" : "absent", packages };
    }
    const reason = this.failedAt.get(key);
    if (reason !== undefined) return { state: "failed", reason };
    return { state: this.pendingAt.has(key) ? "pending" : "unknown" };
  }

  /** The package resolves to a vulnerable version in some workspace. */
  isPresent(task: Pick<DatingTask, "vulnerability_id" | "pkg">, packages: readonly ProbePackage[]): boolean {
    const known = this.versions.get(`${task.vulnerability_id}${SEP}${task.pkg}`);
    return packages.some(
      (p) =>
        p.name === task.pkg &&
        (isVulnerableVersion(p.version, known?.ranges ?? null) ?? known?.seen.has(p.version) ?? false),
    );
  }
}

function notFound(reason: string): SearchStep {
  return { step: "done", dating: { outcome: "not_found", reason, commit: null, packages_before: null, packages_after: null } };
}

function intervalKey(entry: string, from: string | null, to: string): string {
  return `${entry}${SEP}${from ?? ""}${SEP}${to}`;
}

/** What the runner should do next for the probes of an experiment. */
export interface ProbePlan {
  /** Intervals to list before their events can be searched */
  intervals: IntervalRequest[];
  /** Commits to analyse, fixes first then introductions, each oldest first */
  probes: ProbeRequest[];
  /** Probes still in flight */
  waiting: number;
}

/** Fixes before introductions, each by interval then entry order. */
function taskOrder(a: DatingTask, b: DatingTask): number {
  const kind = (t: DatingTask): number => (t.kind === "fix" ? 0 : 1);
  return (
    kind(a) - kind(b) ||
    (a.before.grid_index ?? 0) - (b.before.grid_index ?? 0) ||
    (a.after.grid_index ?? 0) - (b.after.grid_index ?? 0)
  );
}

/**
 * The next probe work, given the tasks deriving exposures searched. Each
 * commit and interval is requested once, however many events need it.
 */
export function probePlan(search: ProbeSearch): ProbePlan {
  const intervals = new Map<string, IntervalRequest>();
  for (const { task } of [...search.intervalRequests].sort((a, b) => taskOrder(a.task, b.task))) {
    const key = intervalKey(task.entry, task.before.commit_hash ?? null, task.after.commit_hash!);
    if (!intervals.has(key)) intervals.set(key, { entry: task.entry, from: task.before, to: task.after });
  }
  const probes = new Map<string, ProbeRequest>();
  for (const { task, commit } of [...search.probeRequests].sort((a, b) => taskOrder(a.task, b.task))) {
    const key = `${task.entry}${SEP}${commit.sha}`;
    if (!probes.has(key)) probes.set(key, { entry: task.entry, commit });
  }
  return { intervals: [...intervals.values()], probes: [...probes.values()], waiting: search.waiting };
}

/**
 * The repository-relative lockfile path of a js-sbom result, whose
 * relative path starts with the analysed commit's directory. Null if unknown.
 */
export function repoLockfilePath(sbom: unknown, commitHash: string): string | null {
  const info = (sbom as { analysis_info?: { paths?: { relative_lock_file_path?: unknown } } } | null)
    ?.analysis_info;
  const path = info?.paths?.relative_lock_file_path;
  if (typeof path !== "string" || path === "") return null;
  const prefix = `${commitHash}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
