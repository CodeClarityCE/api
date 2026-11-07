/**
 * Exposures, introductions and fixes of an experiment (spec #30), derived
 * on read from its snapshot runs, copied instances and probe outcome rows
 * (ADR 0001). Pure: no Nest or TypeORM imports.
 */
import { gridDay } from "./experiment-grid";
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

export interface ExposuresInput {
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

const DAY_MS = 86_400_000;

/** The calendar day of a timestamp string, whatever its format. */
function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const prefix = /^\d{4}-\d{2}-\d{2}/.exec(value);
  if (prefix) return prefix[0];
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : gridDay(new Date(parsed));
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
export function deriveExposures(input: ExposuresInput): Exposure[] {
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
        if (run.status !== "done") return "gap";
        return hits[i]!.has(key) ? "present" : "absent";
      });
      for (const span of walk(observations)) {
        const latest = hits[span.lastPresent]!.get(key)![0]!;
        const published = dayOf(latest.published_date);
        let introduction: Introduction | null = null;
        if (span.from !== null) {
          const event = snapshotEvent(runs[span.from]!, runs[span.startAt]!);
          introduction = { ...event, residence_days: daysBetween(event.date, published) };
        }
        let fix: Fix | null = null;
        if (span.to !== null) {
          const before = runs[span.lastPresent]!;
          const after = runs[span.to]!;
          const event = snapshotEvent(before, after);
          fix = {
            ...event,
            kind: fixKind(entry, pkg, hits[span.lastPresent]!.get(key)!, after, packagesAt),
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

/**
 * Upgraded if the package still resolves anywhere after the fix (at a safe
 * version, since it is no longer present), else removed directly when a
 * vulnerable hit before it was a direct dependency, else transitively.
 */
function fixKind(
  entry: string,
  pkg: string,
  before: readonly ResultsVulnerabilityInput[],
  after: ResultsRunInput,
  packagesAt: ReadonlyMap<string, ProbePackage[]>,
): FixKind | null {
  let resolves = false;
  if (!isEmpty(after)) {
    const packages = after.commit_hash
      ? packagesAt.get(`${entry}\u0000${after.commit_hash}`)
      : undefined;
    if (!packages) return null;
    resolves = packages.some((p) => p.name === pkg);
  }
  if (resolves) return "upgraded";
  return before.some((v) => v.direct_dependency === true)
    ? "removed_direct"
    : "removed_transitive";
}
