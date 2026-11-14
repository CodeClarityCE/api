/**
 * Grid parity with the archived top100 study. The fixture (see
 * build-top100-grid-fixture.ts) sits next to this file; the suite skips
 * without it, and EXPERIMENTS_GRID_FIXTURE points elsewhere.
 *
 * 1. Fixture fidelity, exact: the archive's interval rules rerun over the
 *    fixture reproduce its results_numbers.json grid blocks.
 * 2. v2 against the archive: every difference falls in a deliberate rule
 *    change. Gaps are skipped, not censored; HEAD is always last; single
 *    observations still report exposures; a bump that stays vulnerable is
 *    no fix; v2's halving can visit commits the archive never fetched
 *    (snapshot precision here); any contradicting commit makes a window
 *    ambiguous.
 *
 * Tolerance: of fixes both date to a commit, at least 90% match the
 * archive's commit (observed 93.3%), 98% without the stays-vulnerable rule
 * (observed 98.5%); the rest are windows that change state more than once.
 * Fix kind agrees on at least 99% (observed 100%). The rest is exact.
 *
 * Archive quirk kept on purpose: survival_disclosed and trajectory_balanced
 * only count NVD-dated instances, since pandas dropped other date formats.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- reads the fixture path, overridable by env */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { deriveExposures, type Exposure } from "../experiment-exposures";
import { DAY_MS, publishedDay } from "../experiment-grid";
import { loadOverTime } from "../experiment-load";
import {
  aggregateExperimentResults,
  type ExperimentResults,
  type ExperimentResultsInput,
} from "../experiment-results";
import { NO_LOCKFILE_YET, type ProbePackage } from "../experiment-row-copy";
import { kaplanMeier, kmMedian } from "../experiment-stats";
import {
  isVulnerableVersion,
  type VulnerableVersions,
} from "../experiment-vulnerable-versions";

import {
  fixtureLines,
  type GridFixtureEntry,
  type GridFixtureExpected,
  type GridFixtureRun,
  type RemediationEvent,
  resultsInput,
} from "./build-top100-grid-fixture";

const FIXTURE =
  process.env["EXPERIMENTS_GRID_FIXTURE"] ??
  resolve(__dirname, "top100-grid.jsonl.br");

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const SEP = "\u0000";
const HEAD_INDEX = 40;

function loadFixture(): {
  entries: GridFixtureEntry[];
  last: GridFixtureExpected;
} {
  const lines = fixtureLines(readFileSync(FIXTURE));
  return {
    entries: lines
      .slice(0, -1)
      .map((line) => JSON.parse(line) as GridFixtureEntry),
    last: JSON.parse(lines.at(-1)!) as GridFixtureExpected,
  };
}

/** A done snapshot with rows: what the archive's analyses table holds. */
function isAnalysed(run: GridFixtureRun): boolean {
  return run.status === "done" && run.error !== NO_LOCKFILE_YET;
}

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const utcDay = (iso: string): number =>
  Math.floor(Date.parse(iso) / DAY_MS) * DAY_MS;

/** A publication time in ms; zone-less timestamps are UTC, as pandas reads them. */
function publishedMs(value: string | null): number {
  if (!value) return NaN;
  return Date.parse(
    /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`,
  );
}

/** The archive's pandas parse: only NVD's zone-less format survives (see header). */
function archivePublishedMs(value: string | null): number {
  return value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/.test(value)
    ? publishedMs(value)
    : NaN;
}

/** When a snapshot was observed: its grid date, or HEAD's commit time. */
const observedMs = (run: GridFixtureRun): number =>
  run.grid_date ? Date.parse(run.grid_date) : Date.parse(run.committed_at!);

interface ArchiveSnapshot {
  date: number;
  head: boolean;
  grid_index: number;
}

interface ArchiveInterval {
  entry: string;
  /** vulnerability id and package, NUL-joined */
  key: string;
  severity: string | null;
  /** Grid indexes of its first and last snapshots */
  first: number;
  last: number;
  /** YYYY-MM-DD of its last snapshot, as remediation_events keys it */
  last_seen: string;
  first_seen: number;
  duration: number;
  event: 0 | 1;
}

type InstanceFilter = (
  run: GridFixtureRun,
  published: string | null,
) => boolean;

/**
 * The archive's stats.presence_intervals over the fixture: a grid date
 * without a done snapshot between two observations censors the interval;
 * durations run from first seen to the next snapshot.
 */
function archiveIntervals(
  entries: GridFixtureEntry[],
  keep: InstanceFilter = () => true,
): ArchiveInterval[] {
  const grid = [
    ...new Set(
      entries.flatMap((e) =>
        e.runs
          .filter((r) => isAnalysed(r) && r.grid_date)
          .map((r) => r.grid_date!),
      ),
    ),
  ]
    .map((d) => Date.parse(d))
    .sort((a, b) => a - b);
  const out: ArchiveInterval[] = [];
  for (const entry of [...entries].sort((a, b) =>
    a.entry < b.entry ? -1 : 1,
  )) {
    const presence = new Map<number, Set<string>>();
    const severity = new Map<string, string>();
    for (const run of entry.runs.filter(isAnalysed)) {
      const keys = new Set<string>();
      for (const [, metaIndex] of run.instances) {
        const meta = entry.meta[metaIndex]!;
        if (!keep(run, meta.published_date)) continue;
        const key = `${meta.vulnerability_id}${SEP}${meta.affected_dependency}`;
        keys.add(key);
        if (meta.severity_class !== null && !severity.has(key))
          severity.set(key, meta.severity_class);
      }
      presence.set(run.grid_index, keys);
    }
    const snapshots: ArchiveSnapshot[] = entry.runs
      .filter(isAnalysed)
      .map((r) => ({
        date: r.grid_date ? Date.parse(r.grid_date) : utcDay(r.committed_at!),
        head: r.grid_date === null,
        grid_index: r.grid_index,
      }))
      .sort((a, b) => a.date - b.date || Number(a.head) - Number(b.head));
    if (snapshots.length < 2) continue;
    const gapAfter = snapshots
      .slice(0, -1)
      .map((s, i) =>
        grid.some((d) => d > s.date && d < snapshots[i + 1]!.date),
      );
    const keys = [
      ...new Set(snapshots.flatMap((s) => [...presence.get(s.grid_index)!])),
    ].sort();
    for (const key of keys) {
      let start: ArchiveSnapshot | null = null;
      snapshots.forEach((s, i) => {
        if (!presence.get(s.grid_index)!.has(key)) return;
        start ??= s;
        const base = {
          entry: entry.entry,
          key,
          severity: severity.get(key) ?? null,
          first: start.grid_index,
          last: s.grid_index,
          last_seen: dayOf(s.date),
          first_seen: start.date,
        };
        if (i === snapshots.length - 1 || gapAfter[i]) {
          out.push({
            ...base,
            duration: (s.date - start.date) / DAY_MS,
            event: 0,
          });
          start = null;
        } else if (!presence.get(snapshots[i + 1]!.grid_index)!.has(key)) {
          out.push({
            ...base,
            duration: (snapshots[i + 1]!.date - start.date) / DAY_MS,
            event: 1,
          });
          start = null;
        }
      });
    }
  }
  return out;
}

interface MinedFixes {
  found: Map<string, { day: number; commit: string; kind: string | null }>;
  ambiguous: Set<string>;
  byKey: Map<string, RemediationEvent>;
}

/** The mined fix of each (entry, package, last seen), joined as merge_day_resolution does. */
function minedFixes(events: RemediationEvent[]): MinedFixes {
  const mined: MinedFixes = {
    found: new Map(),
    ambiguous: new Set(),
    byKey: new Map(),
  };
  for (const e of events) {
    const key = `${e.npm_name}|${e.affected_dependency}|${e.last_seen}`;
    mined.byKey.set(key, e);
    if (e.status === "found" && e.fixed_at) {
      const day = utcDay(e.fixed_at);
      const known = mined.found.get(key);
      if (!known || day > known.day)
        mined.found.set(key, {
          day,
          commit: e.fix_commit_sha!,
          kind: e.fix_kind,
        });
    } else if (e.status === "ambiguous") {
      mined.ambiguous.add(key);
    }
  }
  return mined;
}

type MergedInterval = ArchiveInterval & {
  resolution: "day" | "quarter";
  excluded: boolean;
  fix_kind: string | null;
};

/** The archive's stats.merge_day_resolution: mined fix days replace snapshot durations. */
function mergeDayResolution(
  intervals: ArchiveInterval[],
  mined: MinedFixes,
): MergedInterval[] {
  return intervals.map((i) => {
    const out: MergedInterval = {
      ...i,
      resolution: "quarter",
      excluded: false,
      fix_kind: null,
    };
    if (i.event !== 1) return out;
    const key = `${i.entry}|${i.key.split(SEP)[1]}|${i.last_seen}`;
    const found = mined.found.get(key);
    if (found) {
      if (found.day >= i.first_seen) {
        return {
          ...out,
          duration: (found.day - i.first_seen) / DAY_MS,
          resolution: "day",
          fix_kind: found.kind,
        };
      }
    } else if (mined.ambiguous.has(key)) {
      out.excluded = true;
    }
    return out;
  });
}

function survivalBlock(intervals: ArchiveInterval[]): Record<string, unknown> {
  const fixed = intervals.filter((i) => i.event === 1).length;
  const byClass = kmBySeverity(intervals);
  return {
    intervals: intervals.length,
    fixed,
    censored: intervals.length - fixed,
    unclassed_intervals:
      intervals.length - Object.values(byClass).reduce((n, s) => n + s.n, 0),
    km_by_severity: byClass,
  };
}

/** Archive km_by_severity: n and Kaplan-Meier median per severity class. */
function kmBySeverity(
  intervals: readonly ArchiveInterval[],
): Record<string, { n: number; km_median_days: number }> {
  return Object.fromEntries(
    SEVERITIES.map((sev) => {
      const s = intervals.filter((i) => i.severity?.toUpperCase() === sev);
      const median = kmMedian(
        kaplanMeier(
          s.map((i) => i.duration),
          s.map((i) => i.event === 1),
        ),
      );
      return [sev, { n: s.length, km_median_days: median }];
    }),
  );
}

const indexOfLabel = (
  label: string | null,
  dates: readonly string[],
): number => (label === null ? HEAD_INDEX : dates.indexOf(label));

function tally(): {
  counts: Record<string, number>;
  add: (key: string) => void;
} {
  const counts: Record<string, number> = {};
  return { counts, add: (key) => (counts[key] = (counts[key] ?? 0) + 1) };
}

/**
 * Pairs each v2 exposure with the archive intervals of the same entry,
 * vulnerability and package inside its span, and names how they differ.
 */
function classifyExposures(
  entries: GridFixtureEntry[],
  intervals: ArchiveInterval[],
  exposures: Exposure[],
): Record<string, number> {
  const dates = entries[0]!.runs
    .filter((r) => r.grid_date)
    .map((r) => r.grid_date!);
  const byKey = new Map<string, ArchiveInterval[]>();
  for (const i of intervals) {
    const key = `${i.entry}${SEP}${i.key}`;
    byKey.set(key, [...(byKey.get(key) ?? []), i]);
  }
  // Quiet repos whose HEAD commit predates their last done grid date
  const headEarly = new Set(
    entries
      .filter((entry) => {
        const head = entry.runs.at(-1)!;
        const lastDated = entry.runs
          .filter((r) => isAnalysed(r) && r.grid_date)
          .at(-1)?.grid_date;
        return (
          isAnalysed(head) &&
          lastDated &&
          utcDay(head.committed_at!) < Date.parse(lastDated)
        );
      })
      .map((entry) => entry.entry),
  );
  const single = new Set(
    entries
      .filter((e) => e.runs.filter(isAnalysed).length < 2)
      .map((e) => e.entry),
  );
  const { counts, add } = tally();
  const used = new Set<ArchiveInterval>();
  for (const e of exposures) {
    const first = indexOfLabel(e.first_present, dates);
    const last = indexOfLabel(e.last_present, dates);
    const chain = (
      byKey.get(
        `${e.dataset_entry_id}${SEP}${e.vulnerability_id}${SEP}${e.affected_dependency}`,
      ) ?? []
    )
      .filter((i) => i.first >= first && i.last <= last)
      .sort((a, b) => a.first - b.first);
    chain.forEach((i) => used.add(i));
    const why = ((): string => {
      if (chain.length === 0) return "unexplained: no archive interval";
      if (chain[0]!.first !== first || chain.at(-1)!.last !== last)
        return "unexplained: span differs";
      if (chain.slice(0, -1).some((i) => i.event !== 0))
        return "unexplained: fixed inside span";
      if ((chain.at(-1)!.event === 1) !== (e.fix !== null)) {
        const afterGap =
          e.fix !== null && indexOfLabel(e.fix.interval_to, dates) - last > 1;
        return afterGap
          ? "fixed after a gap the archive censored at"
          : "unexplained: fix differs";
      }
      return chain.length > 1 ? "joined across gaps" : "same";
    })();
    if (!why.startsWith("unexplained")) add(why);
    else if (headEarly.has(e.dataset_entry_id)) add("HEAD out of grid order");
    else if (single.has(e.dataset_entry_id)) add("single observation");
    else add(why);
  }
  for (const i of intervals) {
    if (used.has(i)) continue;
    add(
      headEarly.has(i.entry)
        ? "HEAD out of grid order"
        : "unexplained: archive interval unmatched",
    );
  }
  return counts;
}

/** v2 fix dating against the mined fix of the same (entry, package, last seen snapshot). */
function compareFixDating(
  entries: GridFixtureEntry[],
  exposures: Exposure[],
  mined: MinedFixes,
): { counts: Record<string, number>; kinds: Record<string, number> } {
  const dates = entries[0]!.runs
    .filter((r) => r.grid_date)
    .map((r) => r.grid_date!);
  const byEntry = new Map(entries.map((e) => [e.entry, e]));
  const packagesAt = new Map<string, ProbePackage[]>(
    entries.flatMap((e) =>
      e.probes.map((p) => [`${e.entry}|${p.commit_hash}`, p.packages] as const),
    ),
  );
  const ranges = new Map<string, VulnerableVersions>();
  for (const e of entries) {
    for (const m of e.meta) {
      if (m.vulnerable_versions)
        ranges.set(
          `${m.vulnerability_id}|${m.affected_dependency}`,
          m.vulnerable_versions,
        );
    }
  }
  const { counts, add } = tally();
  const kinds = tally();
  const family = (kind: string | null): string | null =>
    kind?.startsWith("removed") ? "removed" : kind;
  for (const e of exposures) {
    if (!e.fix) continue;
    const last = indexOfLabel(e.last_present, dates);
    // A bracket across a gap was censored, never mined
    if (indexOfLabel(e.fix.interval_to, dates) - last > 1) continue;
    const entry = byEntry.get(e.dataset_entry_id)!;
    const lastRun = entry.runs[last]!;
    const lastSeen = e.last_present ?? lastRun.committed_at!.slice(0, 10);
    const key = `${e.dataset_entry_id}|${e.affected_dependency}|${lastSeen}`;
    const found = mined.found.get(key);
    let archive: string = mined.byKey.get(key)?.status ?? "no unit";
    if (found) archive = "found";
    else if (mined.ambiguous.has(key)) archive = "ambiguous";
    const v2 = e.fix.probe_outcome ?? "undated";
    if (archive !== "found" || v2 !== "found") {
      if (
        archive === "found" &&
        v2 === "not_found" &&
        found!.commit === lastRun.commit_hash
      ) {
        // The archive's window started at, and included, the last-seen commit
        add("found/not_found: archive dated it to the last-seen commit");
      } else if (
        archive === "ambiguous" &&
        v2 === "found" &&
        mined.byKey.get(key)?.method === "not_in_root_lockfile"
      ) {
        add("ambiguous/found: not in the root lockfile, found in a workspace");
      } else {
        add(`${archive}/${v2}`);
      }
      continue;
    }
    if (e.fix.commit_hash === found!.commit) {
      add("same commit");
      kinds.add(
        family(found!.kind) === family(e.fix.kind) ? "same kind" : "other kind",
      );
      continue;
    }
    const atArchive =
      packagesAt.get(`${e.dataset_entry_id}|${found!.commit}`) ?? [];
    const vv =
      ranges.get(`${e.vulnerability_id}|${e.affected_dependency}`) ?? null;
    const stillVulnerable = atArchive.some(
      (p) =>
        p.name === e.affected_dependency &&
        isVulnerableVersion(p.version, vv) === true,
    );
    add(
      stillVulnerable && Date.parse(e.fix.date!) > found!.day
        ? "later commit: bump stayed vulnerable"
        : "other commit",
    );
  }
  return { counts, kinds: kinds.counts };
}

const describeWithFixture = existsSync(FIXTURE) ? describe : describe.skip;

describeWithFixture("parity with the archived top100 grid study", () => {
  let entries: GridFixtureEntry[];
  let expected: Record<string, unknown>;
  let events: RemediationEvent[];
  let input: ExperimentResultsInput;
  let results: ExperimentResults;
  let exposures: Exposure[];
  let intervals: ArchiveInterval[];

  beforeAll(() => {
    const fixture = loadFixture();
    entries = fixture.entries;
    expected = fixture.last.expected;
    events = fixture.last.remediation_events;
    input = resultsInput(entries);
    results = aggregateExperimentResults(input);
    exposures = deriveExposures(input);
    intervals = archiveIntervals(entries);
  }, 120_000);

  describe("the fixture carries the archive's input", () => {
    it("matches coverage per grid date, with pre-repo dates as empty runs", () => {
      const coverage = expected["coverage"] as {
        per_date_completed: Record<string, number>;
        head_completed: number;
      };
      const done = Object.fromEntries(
        results.grid_coverage
          .filter((row) => row.grid_date !== null)
          .map((row) => [row.grid_date, row.done]),
      );
      expect(done).toEqual(coverage.per_date_completed);
      expect(results.grid_coverage.at(-1)).toMatchObject({
        grid_date: null,
        done: coverage.head_completed,
      });
      // 100 entries x 41 snapshots, less the 3574 manifest rows
      expect(results.grid_coverage.reduce((n, row) => n + row.empty, 0)).toBe(
        526,
      );
    });

    it("reproduces survival_residence with the archive's interval rules", () => {
      expect(survivalBlock(intervals)).toEqual(expected["survival_residence"]);
    });

    it("reproduces survival_disclosed, pandas date quirk included", () => {
      const disclosed = archiveIntervals(
        entries,
        (run, published) => archivePublishedMs(published) <= observedMs(run),
      );
      expect(survivalBlock(disclosed)).toEqual(expected["survival_disclosed"]);
    });

    it("reproduces survival_day_resolution from the mined events", () => {
      const block = expected["survival_day_resolution"] as {
        events: number;
        by_status: Record<string, number>;
        residence: {
          intervals: number;
          fixed: number;
          day_resolution: number;
          excluded_ambiguous: number;
          km_by_severity: Record<string, { n: number; km_median_days: number }>;
          fix_kind: { day_fixed_split: Record<string, number> };
        };
      };
      expect(events).toHaveLength(block.events);
      expect(tallyBy(events, (e) => e.status)).toEqual(block.by_status);
      const merged = mergeDayResolution(intervals, minedFixes(events));
      const kept = kmBySeverity(merged.filter((i) => !i.excluded));
      expect({
        intervals: merged.length,
        fixed: merged.filter((i) => i.event === 1).length,
        day_resolution: merged.filter((i) => i.resolution === "day").length,
        excluded_ambiguous: merged.filter((i) => i.excluded).length,
        km_by_severity: kept,
        day_fixed_split: tallyBy(
          merged.filter((i) => !i.excluded && i.resolution === "day"),
          (i) => i.fix_kind ?? "null",
        ),
      }).toEqual({
        intervals: block.residence.intervals,
        fixed: block.residence.fixed,
        day_resolution: block.residence.day_resolution,
        excluded_ambiguous: block.residence.excluded_ambiguous,
        day_fixed_split: block.residence.fix_kind.day_fixed_split,
        km_by_severity: Object.fromEntries(
          Object.entries(block.residence.km_by_severity).map(([sev, s]) => [
            sev,
            { n: s.n, km_median_days: s.km_median_days },
          ]),
        ),
      });
    });

    it("reproduces trajectory_balanced, pandas date quirk included", () => {
      const panel = entries.filter((e) =>
        e.runs.slice(0, -1).every(isAnalysed),
      );
      const trajectory: Record<string, number> = {};
      for (const entry of panel) {
        for (const run of entry.runs.slice(0, -1)) {
          const known = run.instances.filter(
            ([, m]) =>
              archivePublishedMs(entry.meta[m]!.published_date) <=
              observedMs(run),
          );
          trajectory[run.grid_date!] =
            (trajectory[run.grid_date!] ?? 0) + known.length / panel.length;
        }
      }
      const archive = expected["trajectory_balanced"] as Record<string, number>;
      expect(Object.keys(trajectory)).toEqual(Object.keys(archive));
      for (const [date, mean] of Object.entries(archive))
        expect(trajectory[date]).toBeCloseTo(mean, 9);
      expect(panel).toHaveLength(
        (expected["trajectory_balanced_meta"] as { panel_n: number }).panel_n,
      );
    });
  });

  describe("v2 against the archive", () => {
    it("keeps the HEAD blocks of the v1 parity test", () => {
      const v1 = JSON.parse(
        readFileSync(resolve(__dirname, "top100-expected.json"), "utf8"),
      ) as {
        headline: Record<string, unknown>;
      };
      const {
        n_projects,
        n_affected,
        instances,
        distinct_vuln_packages,
        top_packages,
      } = v1.headline;
      expect(results.headline).toMatchObject({
        n_projects,
        n_affected,
        instances,
        distinct_vuln_packages,
        top_packages,
      });
    });

    it("loads the balanced panel as the archive does, as-of only adding same-day disclosures", () => {
      const panel = entries.filter((e) =>
        e.runs.slice(0, -1).every(isAnalysed),
      );
      const ids = new Set(panel.map((e) => e.entry));
      const rows = loadOverTime({
        runs: input.runs.filter((r) => ids.has(r.dataset_entry_id!)),
        vulnerabilities: input.vulnerabilities,
        head_cutoff: new Date(), // HEAD is sliced off below
      }).slice(0, -1);
      const meta = expected["trajectory_balanced_meta"] as {
        panel_hist_rows_total: number;
      };
      expect(rows.reduce((n, r) => n + r.hindsight!, 0)).toBe(
        meta.panel_hist_rows_total,
      );
      // With every date format read, v2 counts an advisory published on the grid day
      // itself (cutoff by day); the archive stopped at midnight
      for (const row of rows) {
        let byMidnight = 0;
        let sameDay = 0;
        for (const entry of panel) {
          const run = entry.runs.find((r) => r.grid_date === row.grid_date)!;
          for (const [, m] of run.instances) {
            const published = entry.meta[m]!.published_date;
            if (publishedMs(published) <= observedMs(run)) byMidnight++;
            else if (publishedDay(published) === row.grid_date) sameDay++;
          }
        }
        expect({
          date: row.grid_date,
          as_of: row.as_of! - row.undated,
        }).toEqual({ date: row.grid_date, as_of: byMidnight + sameDay });
      }
    });

    it("derives the archive's intervals as exposures, but for the rule changes", () => {
      expect(classifyExposures(entries, intervals, exposures)).toEqual({
        same: 22849,
        "joined across gaps": 2021,
        "fixed after a gap the archive censored at": 640,
        "HEAD out of grid order": 984,
        "single observation": 2,
      });
    });

    it("dates fixes to the archive's mined commits within the tolerance", () => {
      const { counts, kinds } = compareFixDating(
        entries,
        exposures,
        minedFixes(events),
      );
      const same = counts["same commit"] ?? 0;
      const bump = counts["later commit: bump stayed vulnerable"] ?? 0;
      const other = counts["other commit"] ?? 0;
      expect(same / (same + bump + other)).toBeGreaterThanOrEqual(0.9);
      expect(same / (same + other)).toBeGreaterThanOrEqual(0.98);
      expect((kinds["same kind"] ?? 0) / same).toBeGreaterThanOrEqual(0.99);
      // Windows without lockfile commits agree exactly
      expect(
        Object.keys(counts).filter((k) => k.startsWith("not_found/")),
      ).toEqual(["not_found/not_found"]);
      // Every other pairing is a named class
      expect(Object.keys(counts).sort()).toEqual(
        [
          "same commit",
          "later commit: bump stayed vulnerable",
          "other commit",
          "found/undated",
          "ambiguous/undated",
          "found/ambiguous",
          "ambiguous/ambiguous",
          "ambiguous/not_found",
          "ambiguous/found",
          "ambiguous/found: not in the root lockfile, found in a workspace",
          "found/not_found: archive dated it to the last-seen commit",
          "not_found/not_found",
          "no unit/undated",
        ].sort(),
      );
    });
  });
});

function tallyBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Record<string, number> {
  const { counts, add } = tally();
  for (const item of items) add(key(item));
  return counts;
}
