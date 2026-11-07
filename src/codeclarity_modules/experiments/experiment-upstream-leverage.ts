/**
 * Upstream leverage over time (spec #30): per grid date, how many packages
 * clear half and most of the instances, and per grid interval, how much of
 * the remediation came from upstream (removed_transitive fixes). Hindsight
 * view, pure: no Nest or TypeORM imports.
 */
import type { Exposure, FixKind } from "./experiment-exposures";
import { gridDay } from "./experiment-grid";
import type { ResultsRunInput, ResultsVulnerabilityInput } from "./experiment-results";
import { packagesToClear } from "./experiment-stats";

/** Instance concentration at one snapshot of the grid. */
export interface PackagesToClearRow {
  /** YYYY-MM-DD, null for HEAD */
  grid_date: string | null;
  /** Done snapshots observed at this date, empty ones included */
  projects: number;
  instances: number;
  distinct_packages: number;
  /** Null when no snapshot at this date is done */
  pkgs_clear_50: number | null;
  pkgs_clear_80: number | null;
}

/** Fix kinds of the fixes whose later bracketing snapshot ends one interval. */
export interface FixKindCounts {
  fixes: number;
  upgraded: number;
  removed_direct: number;
  removed_transitive: number;
  /** No probe outcome row after the fix, so its kind is not known */
  unknown: number;
  /** removed_transitive over fixes of known kind; unknown ones are left out */
  removed_transitive_share: number | null;
  /** Share of fixes only dated to a snapshot interval */
  snapshot_precision_share: number | null;
}

export interface FixKindRow extends FixKindCounts {
  /** The grid interval (from, to]; to is null for HEAD */
  interval_from: string | null;
  interval_to: string | null;
}

export interface UpstreamLeverageBlock {
  /** Oldest first, HEAD last */
  packages_to_clear: PackagesToClearRow[];
  /** One per grid interval, oldest first, ending at HEAD */
  fix_kinds: FixKindRow[];
  overall: FixKindCounts;
}

const HEAD = "HEAD";

function dateOf(run: ResultsRunInput): string {
  return run.grid_date ? gridDay(run.grid_date) : HEAD;
}

/** Grid dates present in the runs, YYYY-MM-DD order with HEAD last. */
function gridDates(runs: readonly ResultsRunInput[]): string[] {
  const dates = [...new Set(runs.map(dateOf))].filter((d) => d !== HEAD).sort();
  return runs.some((run) => !run.grid_date) ? [...dates, HEAD] : dates;
}

const label = (date: string): string | null => (date === HEAD ? null : date);

function packagesToClearRows(
  runs: readonly ResultsRunInput[],
  dates: readonly string[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): PackagesToClearRow[] {
  const byRun = new Map<string, ResultsVulnerabilityInput[]>();
  for (const v of vulnerabilities) {
    byRun.set(v.run_id, [...(byRun.get(v.run_id) ?? []), v]);
  }
  return dates.map((date) => {
    const done = runs.filter((run) => dateOf(run) === date && run.status === "done" && run.rows_run_id);
    // Instances per package over every done snapshot at this date
    const counts = new Map<string, number>();
    for (const run of done) {
      for (const v of byRun.get(run.rows_run_id!) ?? []) {
        if (v.affected_dependency === null) continue;
        counts.set(v.affected_dependency, (counts.get(v.affected_dependency) ?? 0) + 1);
      }
    }
    const values = [...counts.values()];
    const observed = done.length > 0;
    return {
      grid_date: label(date),
      projects: done.length,
      instances: values.reduce((total, n) => total + n, 0),
      distinct_packages: counts.size,
      pkgs_clear_50: observed ? packagesToClear(values, 0.5) : null,
      pkgs_clear_80: observed ? packagesToClear(values, 0.8) : null,
    };
  });
}

function kindCounts(fixes: readonly NonNullable<Exposure["fix"]>[]): FixKindCounts {
  const count = (kind: FixKind | null): number => fixes.filter((fix) => fix.kind === kind).length;
  const unknown = count(null);
  const known = fixes.length - unknown;
  const transitive = count("removed_transitive");
  return {
    fixes: fixes.length,
    upgraded: count("upgraded"),
    removed_direct: count("removed_direct"),
    removed_transitive: transitive,
    unknown,
    removed_transitive_share: known ? transitive / known : null,
    snapshot_precision_share: fixes.length
      ? fixes.filter((fix) => fix.precision === "snapshot").length / fixes.length
      : null,
  };
}

/**
 * Packages to clear per grid date, over the done snapshots at that date,
 * and fix kinds per grid interval. A fix belongs to the interval ending at
 * its later bracketing snapshot, so one spanning a failed snapshot lands
 * in the interval it was seen fixed.
 */
export function upstreamLeverage(
  runs: readonly ResultsRunInput[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
  exposures: readonly Exposure[],
): UpstreamLeverageBlock {
  const dates = gridDates(runs);
  const fixes = exposures.flatMap((e) => (e.fix ? [e.fix] : []));
  return {
    packages_to_clear: packagesToClearRows(runs, dates, vulnerabilities),
    fix_kinds: dates.slice(1).map((to, i) => ({
      interval_from: label(dates[i]!),
      interval_to: label(to),
      ...kindCounts(fixes.filter((fix) => (fix.interval_to ?? HEAD) === to)),
    })),
    overall: kindCounts(fixes),
  };
}
