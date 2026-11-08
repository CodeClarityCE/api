/**
 * Load over time (spec #30): vulnerability instances per grid date in the
 * hindsight view and the as-of view (ADR 0004), derived on read. Pure: no
 * Nest or TypeORM imports.
 */
import { gridDay, publishedDay } from "./experiment-grid";
import type { ResultsRunInput, ResultsVulnerabilityInput } from "./experiment-results";
import { NO_LOCKFILE_YET } from "./experiment-row-copy";

/** Instance load of one grid date, summed over the dataset's entries. */
export interface LoadRow {
  /** YYYY-MM-DD, null for HEAD */
  grid_date: string | null;
  /** The as-of cutoff day: the grid date, or HEAD's date (see headCutoff) */
  as_of_date: string;
  /** Done snapshots, empty ones included */
  projects: number;
  /** Every instance, null without a done snapshot */
  hindsight: number | null;
  /** Instances whose advisory was published by the cutoff, null without a done snapshot */
  as_of: number | null;
  /** Instances without a readable published date, kept in the as-of view */
  undated: number;
}

export interface LoadInput {
  runs: readonly ResultsRunInput[];
  vulnerabilities: readonly ResultsVulnerabilityInput[];
  /** HEAD's as-of cutoff, from headCutoff */
  head_cutoff: Date;
}

/**
 * Instances per grid date, oldest first, HEAD last. An instance counts once
 * per workspace it was found in. Failed, skipped and pending snapshots add
 * nothing; empty ones count as projects with no load.
 */
export function loadOverTime(input: LoadInput): LoadRow[] {
  const instancesByRun = new Map<string, ResultsVulnerabilityInput[]>();
  for (const v of input.vulnerabilities) {
    if (v.affected_dependency === null) continue;
    const list = instancesByRun.get(v.run_id) ?? [];
    list.push(v);
    instancesByRun.set(v.run_id, list);
  }
  const headDay = gridDay(input.head_cutoff);

  const rows = new Map<string, LoadRow>();
  for (const run of input.runs) {
    const gridDate = run.grid_date ? gridDay(run.grid_date) : null;
    const key = gridDate ?? "HEAD";
    let row = rows.get(key);
    if (!row) {
      row = {
        grid_date: gridDate,
        as_of_date: gridDate ?? headDay,
        projects: 0,
        hindsight: null,
        as_of: null,
        undated: 0,
      };
      rows.set(key, row);
    }
    if (run.status !== "done") continue;
    row.projects++;
    row.hindsight ??= 0;
    row.as_of ??= 0;
    if (run.error === NO_LOCKFILE_YET || !run.rows_run_id) continue;
    for (const v of instancesByRun.get(run.rows_run_id) ?? []) {
      row.hindsight++;
      const published = publishedDay(v.published_date);
      if (published === null) row.undated++;
      // YYYY-MM-DD strings compare as dates
      if (published === null || published <= row.as_of_date) {
        row.as_of++;
      }
    }
  }
  return [...rows.values()].sort((a, b) => {
    const ka = a.grid_date ?? "HEAD";
    const kb = b.grid_date ?? "HEAD";
    if (ka < kb) return -1;
    return ka > kb ? 1 : 0;
  });
}
