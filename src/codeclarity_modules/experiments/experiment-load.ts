/** Instances per grid date in the hindsight and as-of views (ADR 0004). Pure. */
import {
  gridDay,
  groupByGridDate,
  instancesByRun,
  publishedDay,
} from "./experiment-grid";
import type {
  ResultsRunInput,
  ResultsVulnerabilityInput,
} from "./experiment-results";
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
  const byRun = instancesByRun(
    input.vulnerabilities.filter((v) => v.affected_dependency !== null),
  );
  const headDay = gridDay(input.head_cutoff);
  return groupByGridDate(input.runs).map(({ grid_date, runs }) => {
    const row: LoadRow = {
      grid_date,
      as_of_date: grid_date ?? headDay,
      projects: 0,
      hindsight: null,
      as_of: null,
      undated: 0,
    };
    for (const run of runs) {
      if (run.status !== "done") continue;
      row.projects++;
      row.hindsight ??= 0;
      row.as_of ??= 0;
      if (run.error === NO_LOCKFILE_YET || !run.rows_run_id) continue;
      for (const v of byRun.get(run.rows_run_id) ?? []) {
        row.hindsight++;
        const published = publishedDay(v.published_date);
        if (published === null) row.undated++;
        // YYYY-MM-DD strings compare as dates
        if (published === null || published <= row.as_of_date) row.as_of++;
      }
    }
    return row;
  });
}
