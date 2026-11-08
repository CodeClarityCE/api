/**
 * Analysis budget (spec #30): an optional cap on the analyses one
 * experiment submits, snapshots and fix probes alike. Once spent no further
 * probe runs; snapshots are never cut. Pure: no Nest or TypeORM.
 */

export const BUDGET_SPENT_REASON = "budget spent";

/** Largest budget create accepts */
export const MAX_ANALYSIS_BUDGET = 1_000_000;

/** The budget and what the experiment submitted so far. */
export interface AnalysisBudgetUsage {
  /** Null when the experiment has no budget */
  analysis_budget: number | null;
  /** Snapshot attempts plus fix probes */
  analyses_submitted: number;
}

/** Analyses the budget still allows; Infinity without a budget. */
export function analysesLeft(usage: AnalysisBudgetUsage | null | undefined): number {
  if (usage?.analysis_budget == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, usage.analysis_budget - usage.analyses_submitted);
}

export function isBudgetSpent(usage: AnalysisBudgetUsage | null | undefined): boolean {
  return analysesLeft(usage) === 0;
}

/**
 * Fix probes estimated per entry per grid interval. The archived top100
 * study took about 1.7 (6715 probes, 100 repos x 40 intervals), rounded up.
 */
export const PROBES_PER_ENTRY_INTERVAL = 2;

/** Every snapshot (grid dates plus HEAD) of every entry, plus the probe estimate. */
export function estimateAnalyses(entries: number, gridCount: number): number {
  return entries * (gridCount + 1) + entries * gridCount * PROBES_PER_ENTRY_INTERVAL;
}
