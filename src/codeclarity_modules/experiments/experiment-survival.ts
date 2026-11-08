/** Kaplan-Meier survival of exposures, open ones censored at HEAD. Pure. */
import type { Exposure } from "./experiment-exposures";
import { DAY_MS, gridDay } from "./experiment-grid";
import { SEVERITY_ORDER } from "./experiment-severity";
import { kaplanMeier, kmMedian, type KmStep } from "./experiment-stats";

export type { KmStep };

/** One survival curve: every exposure, or one severity class. */
export interface SurvivalGroup {
  key: string;
  n: number;
  fixed: number;
  censored: number;
  /** Days until half the exposures are fixed, null if never reached */
  median_days: number | null;
  curve: KmStep[];
}

export interface ExposureSurvivalBlock {
  /** YYYY-MM-DD open exposures are censored at (the HEAD observation) */
  censored_at: string;
  /** Share of fixes only dated to a snapshot interval */
  snapshot_precision_share: number | null;
  overall: SurvivalGroup;
  /** Severity order, classes without exposures left out */
  by_severity: SurvivalGroup[];
}

interface Duration {
  severity: string;
  days: number;
  fixed: boolean;
}

function group(key: string, durations: readonly Duration[]): SurvivalGroup {
  const curve = kaplanMeier(
    durations.map((d) => d.days),
    durations.map((d) => d.fixed),
  );
  const median = kmMedian(curve);
  const fixed = durations.filter((d) => d.fixed).length;
  return {
    key,
    n: durations.length,
    fixed,
    censored: durations.length - fixed,
    median_days: Number.isNaN(median) ? null : median,
    curve,
  };
}

/**
 * Survival of exposures in days. Without an introduction an exposure starts
 * at the first grid date it was seen; a fix ends it, otherwise it is
 * censored at `head`. Gaps are already skipped by deriveExposures.
 */
export function exposureSurvival(
  exposures: readonly Exposure[],
  head: Date,
): ExposureSurvivalBlock {
  const headDay = gridDay(head);
  const durations: Duration[] = exposures.map((e) => {
    const start = e.introduction?.date ?? e.first_present ?? headDay;
    const end = e.fix?.date ?? headDay;
    const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS);
    return {
      severity: e.severity,
      days: Math.max(0, days),
      fixed: e.fix !== null,
    };
  });
  const fixes = exposures.filter((e) => e.fix !== null);
  return {
    censored_at: headDay,
    snapshot_precision_share: fixes.length
      ? fixes.filter((e) => e.fix!.precision === "snapshot").length /
        fixes.length
      : null,
    overall: group("all", durations),
    by_severity: SEVERITY_ORDER.map((severity) =>
      group(
        severity,
        durations.filter((d) => d.severity === severity),
      ),
    ).filter((g) => g.n > 0),
  };
}
