/**
 * Exposures, introductions and fixes of an experiment (spec #30), derived
 * on read from its snapshot runs, copied instances and probe outcome rows
 * (ADR 0001). Pure: no Nest or TypeORM imports.
 */
import { DAY_MS, gridDay, publishedDay } from "./experiment-grid";
import {
  type DatingTask,
  type ProbeDating,
  type ProbeOutcomeKind,
  type ProbePlan,
  probePlan,
  type ProbeRows,
  ProbeSearch,
} from "./experiment-probes";
import type {
  ResultsProbeInput,
  ResultsRunInput,
  ResultsVulnerabilityInput,
} from "./experiment-results";
import { NO_LOCKFILE_YET, type ProbePackage } from "./experiment-row-copy";
import { type SeverityCounts, severityOf } from "./experiment-severity";

export const FIX_KINDS = [
  "upgraded",
  "removed_direct",
  "removed_transitive",
] as const;
export type FixKind = (typeof FIX_KINDS)[number];

/** Dated to a located commit, or only to a snapshot interval. */
export type DatingPrecision = "commit" | "snapshot";

/** When an introduction or fix happened, and how exactly that is known. */
export interface ExposureEvent {
  /** YYYY-MM-DD of the commit the event is dated to */
  date: string | null;
  commit_hash: string | null;
  precision: DatingPrecision;
  /** The bracketing snapshots' grid dates, null for HEAD */
  interval_from: string | null;
  interval_to: string | null;
  /** How fix probes dated it, null while they have not finished */
  probe_outcome: ProbeOutcomeKind | null;
  /** Why probes did not date it to a commit */
  probe_reason: string | null;
}

export interface Introduction extends ExposureEvent {
  /** Days from introduction to disclosure; negative when already disclosed */
  residence_days: number | null;
}

export interface Fix extends ExposureEvent {
  /** Null when the state after the fix is unknown (no probe outcome row) */
  kind: FixKind | null;
  /** Days from disclosure to fix; negative when fixed before disclosure */
  lag_days: number | null;
}

/** One span of (entry, vulnerability, package) present across snapshots. */
export interface Exposure {
  dataset_entry_id: string;
  vulnerability_id: string;
  affected_dependency: string;
  severity: keyof SeverityCounts;
  /** YYYY-MM-DD of the advisory's publication, when known */
  published_date: string | null;
  /** Grid dates of the first and last snapshots it was seen in, null for HEAD */
  first_present: string | null;
  last_present: string | null;
  /** Failed or skipped snapshots inside the span */
  gaps: number;
  /** Still present at the last observation */
  open: boolean;
  /** Null when present at the first observation */
  introduction: Introduction | null;
  fix: Fix | null;
}

export interface ExposuresInput extends ProbeRows {
  runs: readonly ResultsRunInput[];
  vulnerabilities: readonly ResultsVulnerabilityInput[];
  probes?: readonly ResultsProbeInput[];
}

type Observation = "present" | "absent" | "gap";

interface Span {
  from: number | null;
  startAt: number;
  lastPresent: number;
  to: number | null;
  gaps: number;
}

/** Present opens or continues a span, absent closes it, a gap is skipped. */
function walk(observations: readonly Observation[]): Span[] {
  const spans: Span[] = [];
  let current: Span | null = null;
  let lastAbsent: number | null = null;
  observations.forEach((observation, i) => {
    if (observation === "gap") {
      if (current) current.gaps++;
      return;
    }
    if (observation === "present") {
      current ??= { from: lastAbsent, startAt: i, lastPresent: i, to: null, gaps: 0 };
      current.lastPresent = i;
      return;
    }
    if (current) {
      current.to = i;
      spans.push(current);
      current = null;
    }
    lastAbsent = i;
  });
  if (current) spans.push(current);
  return spans;
}

function daysBetween(from: string | null, to: string | null): number | null {
  if (from === null || to === null) return null;
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

function gridLabel(run: ResultsRunInput): string | null {
  return run.grid_date ? gridDay(run.grid_date) : null;
}

/** A done run observed as empty: no repo or no lockfile yet. */
function isEmpty(run: ResultsRunInput): boolean {
  return run.status === "done" && run.error === NO_LOCKFILE_YET;
}

/** The snapshot-precision event: dated to the later snapshot's commit. */
function snapshotEvent(before: ResultsRunInput, after: ResultsRunInput): ExposureEvent {
  return {
    date: after.committed_at ? gridDay(after.committed_at) : gridLabel(after),
    commit_hash: after.commit_hash ?? null,
    precision: "snapshot",
    interval_from: gridLabel(before),
    interval_to: gridLabel(after),
    probe_outcome: null,
    probe_reason: null,
  };
}

/** The event as probes dated it: at the located commit when found. */
function probedEvent(event: ExposureEvent, dating: ProbeDating | null): ExposureEvent {
  if (!dating) return event;
  const dated = { ...event, probe_outcome: dating.outcome, probe_reason: dating.reason };
  if (!dating.commit) return dated;
  return {
    ...dated,
    date: publishedDay(dating.commit.committed_at),
    commit_hash: dating.commit.sha,
    precision: "commit",
  };
}

function byKey(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

const keyOf = (vulnerabilityId: string, pkg: string): string => `${vulnerabilityId}\u0000${pkg}`;

/**
 * Every exposure of the experiment, by entry (in run order), then
 * vulnerability, package and start. "Present" at a snapshot means the
 * package resolves to a vulnerable version in any workspace; failed or
 * skipped snapshots are gaps and empty ones are absent.
 */
export function deriveExposures(
  input: ExposuresInput,
  search: ProbeSearch = new ProbeSearch(input),
): Exposure[] {
  const instancesByRun = new Map<string, ResultsVulnerabilityInput[]>();
  for (const v of input.vulnerabilities) {
    const list = instancesByRun.get(v.run_id) ?? [];
    list.push(v);
    instancesByRun.set(v.run_id, list);
  }
  const packagesAt = new Map<string, ProbePackage[]>();
  for (const probe of input.probes ?? []) {
    packagesAt.set(`${probe.dataset_entry_id}\u0000${probe.commit_hash}`, probe.packages);
  }
  const runsByEntry = new Map<string, ResultsRunInput[]>();
  for (const run of input.runs) {
    if (!run.dataset_entry_id || run.grid_index === undefined || !run.rows_run_id) continue;
    const list = runsByEntry.get(run.dataset_entry_id) ?? [];
    list.push(run);
    runsByEntry.set(run.dataset_entry_id, list);
  }

  const exposures: Exposure[] = [];
  for (const [entry, unsorted] of runsByEntry) {
    const runs = [...unsorted].sort((a, b) => a.grid_index! - b.grid_index!);
    // Only empty snapshots before the first lockfile count as absent; later ones are gaps
    const firstLockfile = runs.findIndex((run) => run.status === "done" && !isEmpty(run));
    const lostLockfile = (i: number): boolean =>
      isEmpty(runs[i]!) && firstLockfile !== -1 && i > firstLockfile;
    // Instances of a done snapshot by (vulnerability, package)
    const hits = runs.map((run) => {
      const byKey = new Map<string, ResultsVulnerabilityInput[]>();
      if (run.status !== "done" || isEmpty(run)) return byKey;
      for (const v of instancesByRun.get(run.rows_run_id!) ?? []) {
        if (!v.vulnerability_id || !v.affected_dependency) continue;
        const key = keyOf(v.vulnerability_id, v.affected_dependency);
        byKey.set(key, [...(byKey.get(key) ?? []), v]);
      }
      return byKey;
    });
    const keys = new Map<string, [string, string]>();
    for (const byKey of hits) {
      for (const [key, [v]] of byKey) {
        keys.set(key, [v!.vulnerability_id!, v!.affected_dependency!]);
      }
    }
    // Keys join id and package with a NUL, so they sort by id then package
    const sortedKeys = [...keys.entries()].sort(([a], [b]) => byKey(a, b));

    for (const [key, [vulnerabilityId, pkg]] of sortedKeys) {
      const observations = runs.map((run, i): Observation => {
        if (run.status !== "done" || lostLockfile(i)) return "gap";
        return hits[i]!.has(key) ? "present" : "absent";
      });
      for (const span of walk(observations)) {
        const latest = hits[span.lastPresent]!.get(key)![0]!;
        const published = publishedDay(latest.published_date);
        let introduction: Introduction | null = null;
        const task = (kind: DatingTask["kind"], before: number, after: number): DatingTask => ({
          entry,
          kind,
          vulnerability_id: vulnerabilityId,
          pkg,
          before: runs[before]!,
          after: runs[after]!,
        });
        if (span.from !== null) {
          const event = probedEvent(
            snapshotEvent(runs[span.from]!, runs[span.startAt]!),
            search.date(task("introduction", span.from, span.startAt)),
          );
          introduction = { ...event, residence_days: daysBetween(event.date, published) };
        }
        let fix: Fix | null = null;
        if (span.to !== null) {
          const before = runs[span.lastPresent]!;
          const after = runs[span.to]!;
          const dating = search.date(task("fix", span.lastPresent, span.to));
          const event = probedEvent(snapshotEvent(before, after), dating);
          const located = dating?.commit ? dating : null;
          fix = {
            ...event,
            kind: fixKind(
              located?.packages_before
                ? located.packages_before.some((p) => p.direct && search.isPresent({ vulnerability_id: vulnerabilityId, pkg }, [p]))
                : hits[span.lastPresent]!.get(key)!.some((v) => v.direct_dependency === true),
              located?.packages_after
                ? located.packages_after.some((p) => p.name === pkg)
                : resolvesAt(entry, pkg, after, packagesAt),
            ),
            lag_days: daysBetween(published, event.date),
          };
        }
        exposures.push({
          dataset_entry_id: entry,
          vulnerability_id: vulnerabilityId,
          affected_dependency: pkg,
          severity: severityOf(latest.severity_class),
          published_date: published,
          first_present: gridLabel(runs[span.startAt]!),
          last_present: gridLabel(runs[span.lastPresent]!),
          gaps: span.gaps,
          open: span.to === null,
          introduction,
          fix,
        });
      }
    }
  }
  return exposures;
}

/** Whether the package resolves in some workspace at a snapshot, null if unknown. */
function resolvesAt(
  entry: string,
  pkg: string,
  run: ResultsRunInput,
  packagesAt: ReadonlyMap<string, ProbePackage[]>,
): boolean | null {
  if (isEmpty(run)) return false;
  const packages = run.commit_hash ? packagesAt.get(`${entry}\u0000${run.commit_hash}`) : undefined;
  return packages ? packages.some((p) => p.name === pkg) : null;
}

/**
 * Upgraded if the package still resolves anywhere after the fix (at a safe
 * version, since it is no longer present), else removed directly when a
 * vulnerable hit before it was a direct dependency, else transitively.
 * Null when the state after the fix is unknown.
 */
function fixKind(directBefore: boolean, resolvesAfter: boolean | null): FixKind | null {
  if (resolvesAfter === null) return null;
  if (resolvesAfter) return "upgraded";
  return directBefore ? "removed_direct" : "removed_transitive";
}

/**
 * The next probe work of an experiment: the events of entries whose
 * snapshots have all ended, searched against what is known so far.
 */
export function planProbes(input: ExposuresInput): ProbePlan {
  const unfinished = new Set(
    input.runs.filter((run) => run.status === "pending").map((run) => run.dataset_entry_id),
  );
  const ready = { ...input, runs: input.runs.filter((run) => !unfinished.has(run.dataset_entry_id)) };
  const search = new ProbeSearch(ready);
  deriveExposures(ready, search);
  return probePlan(search);
}
