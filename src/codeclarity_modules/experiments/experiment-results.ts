/**
 * Experiment results computed on read from tidy rows, shaped like the archived
 * harness's results_numbers.json. Pure; null where the harness had NaN.
 */
import { type AnalysisBudgetUsage, isBudgetSpent } from "./experiment-budget";
import {
  type DatingPrecision,
  deriveExposures,
  type Exposure,
  type ExposureEvent,
  FIX_KINDS,
  type FixKind,
} from "./experiment-exposures";
import { groupByGridDate, isHead } from "./experiment-grid";
import {
  BOOTSTRAP_SETTINGS,
  type ResultIntervals,
  resultIntervalsSteps,
  runYielding,
} from "./experiment-intervals";
import { loadOverTime, type LoadRow } from "./experiment-load";
import type {
  ResultsProbeAnalysisInput,
  ResultsProbeIntervalInput,
} from "./experiment-probes";
import { type ResidenceBlock, residenceBlock } from "./experiment-residence";
import {
  NO_LOCKFILE_YET,
  type ProbePackage,
  type ResolvedPackage,
  type RunSummaryRow,
  type VulnerabilityInstanceRow,
} from "./experiment-row-copy";
import {
  SEVERITY_ORDER,
  type SeverityCounts,
  severityOf,
} from "./experiment-severity";
import {
  type ConfidenceInterval,
  gini,
  median,
  packagesToClear,
  quantile,
  runSteps,
  spearman,
  type Steps,
  wilsonInterval,
} from "./experiment-stats";
import {
  exposureSurvival,
  type ExposureSurvivalBlock,
} from "./experiment-survival";
import {
  type FixKindCounts,
  upstreamLeverage,
  type UpstreamLeverageBlock,
} from "./experiment-upstream-leverage";

/** A done run's summary row with the rank of its dataset entry. */
export type ResultsSummaryInput = Pick<
  RunSummaryRow,
  "total_dependencies" | "total_vulnerabilities" | "package_manager"
> & {
  run_id: string;
  /** Star rank of the dataset entry, 0 for the most starred */
  rank: number;
};

/** The vulnerability instance columns the aggregates read. */
export type ResultsVulnerabilityInput = Pick<
  VulnerabilityInstanceRow,
  | "affected_dependency"
  | "vulnerability_id"
  | "severity_class"
  | "epss_score"
  | "conflict_flag"
  | "winning_source"
  | "withdrawn_date"
> &
  Partial<
    Pick<
      VulnerabilityInstanceRow,
      | "workspace"
      | "affected_version"
      | "direct_dependency"
      | "published_date"
      | "vulnerable_versions"
    >
  > & { run_id: string };

/** Any run of the experiment, done or not. No grid date means HEAD. */
export interface ResultsRunInput {
  status: string;
  error: string | null;
  /** The snapshot's grid date, null for HEAD */
  grid_date?: Date | null;
  /** The run whose copied rows this snapshot reads (itself unless shared) */
  rows_run_id?: string;
  /** Exposures follow runs that have an entry and a grid index */
  dataset_entry_id?: string;
  grid_index?: number;
  /** The pinned commit, null when the snapshot has none yet */
  commit_hash?: string | null;
  committed_at?: Date | null;
  /** The knowledge its rows were matched against, null if none was recorded */
  knowledge?: KnowledgeSnapshot | null;
  /** The analysis it reads and its branch, for probe planning */
  analysis_id?: string | null;
  branch?: string | null;
}

/**
 * A probe outcome row: the packages one entry resolves at one commit.
 * Readers may pass only the packages they care about.
 */
export type { ProbePackage };
export type { ResultsProbeAnalysisInput, ResultsProbeIntervalInput };

export interface ResultsProbeInput {
  dataset_entry_id: string;
  commit_hash: string;
  packages: ResolvedPackage[];
}

export interface KnowledgeSnapshot {
  knowledge_sources: Record<string, string | null>;
  epss_rows: number;
}

export interface ResultsProvenanceInput {
  api_version: string | null;
  analyzer_steps: { name: string; version: string }[][] | null;
  knowledge_start: KnowledgeSnapshot | null;
  knowledge_end: KnowledgeSnapshot | null;
  created_by: string | null;
  created_on: Date;
  started_on: Date | null;
  ended_on: Date | null;
}

export interface ExperimentResultsInput {
  runs: ResultsRunInput[];
  /** One per done run: the project universe of every aggregate */
  summaries: ResultsSummaryInput[];
  vulnerabilities: ResultsVulnerabilityInput[];
  /** Probe outcome rows of snapshot and fix probe commits */
  probes?: ResultsProbeInput[];
  /** The lockfile-touching commits listed between snapshot commits */
  probe_intervals?: ResultsProbeIntervalInput[];
  /** Fix probe analyses, pending, done or failed */
  probe_analyses?: ResultsProbeAnalysisInput[];
  /** The analysis budget and what was submitted, absent without one */
  budget?: AnalysisBudgetUsage | null;
  provenance: ResultsProvenanceInput;
  /** Already computed intervals; null leaves them out, absent computes them */
  bootstrap_intervals?: ResultIntervals | null;
  /** When the results are read: HEAD's date while the experiment runs; now by default */
  read_at?: Date;
}

export { SEVERITY_ORDER, type SeverityCounts } from "./experiment-severity";

/** The scalar headline metrics, one sweep row per vulnerability subset. */
export interface HeadlineScalars {
  n_projects: number;
  n_affected: number;
  affected_share: number | null;
  /** Instances with an affected package */
  instances: number;
  distinct_vuln_packages: number;
  load_median: number | null;
  load_mean: number | null;
  load_max: number | null;
  high_critical_share: number | null;
  top10_pkg_share: number | null;
  top10_proj_share: number | null;
  gini_pkg: number | null;
  gini_proj: number | null;
  pkgs_clear_50: number;
  pkgs_clear_80: number;
  pkgs_clear_90: number;
}

export interface Headline extends HeadlineScalars {
  sev_counts: SeverityCounts;
  /** [package, projects affected], most widespread first, at most 10 */
  top_packages: [string, number][];
  /** Critical and high share of instances that have a severity class */
  high_critical_share_of_classed: number | null;
}

export const SWEEP_SUBSETS = [
  "all",
  "match_correct_only",
  "non_withdrawn",
] as const;
export type SweepSubset = (typeof SWEEP_SUBSETS)[number];

export interface SweepRow extends HeadlineScalars {
  subset: SweepSubset;
}

/** 95% Wilson intervals of the shares in a sweep row. */
export interface ScalarShareIntervals {
  affected_share: ConfidenceInterval | null;
  high_critical_share: ConfidenceInterval | null;
  top10_pkg_share: ConfidenceInterval | null;
  top10_proj_share: ConfidenceInterval | null;
}

export interface HeadlineShareIntervals extends ScalarShareIntervals {
  high_critical_share_of_classed: ConfidenceInterval | null;
}

export interface SweepShareIntervals extends ScalarShareIntervals {
  subset: SweepSubset;
}

/** Intervals sit apart from the point estimates, which stay as they were. */
export interface ShareIntervals {
  headline: HeadlineShareIntervals;
  sweep: SweepShareIntervals[];
  /** Each severity's share of all instances */
  severity: Record<keyof SeverityCounts, ConfidenceInterval | null>;
  /** Share of instances that have an EPSS score */
  epss_nonnull: ConfidenceInterval | null;
  /** Share of fixes only dated to a snapshot interval */
  fix_snapshot_precision: ConfidenceInterval | null;
  /** Share of introductions only dated to a snapshot interval */
  introduction_snapshot_precision: ConfidenceInterval | null;
  /** The removed_transitive share, overall and per interval of fix_kinds */
  removed_transitive: {
    overall: ConfidenceInterval | null;
    by_interval: (ConfidenceInterval | null)[];
  };
}

export interface EpssBlock {
  /** Share of instances that have an EPSS score */
  nonnull_share: number | null;
  median: number | null;
  p90: number | null;
  /** Instances scored strictly above 0.1 and 0.5 */
  over_10pct: number;
  over_50pct: number;
  /** Instances without a score, by whether their id is a CVE */
  missing_non_cve: number;
  missing_cve: number;
}

/** RQ3: star rank against load, over runs with at least one dependency. */
export interface RqcBlock {
  spearman_rho: number | null;
  p: number | null;
  n: number;
  excluded_zero_dep_projects: number;
}

/** RQ4: one row per package manager, sorted by name. */
export interface RqdRow {
  package_manager: string;
  projects: number;
  med_deps: number;
  med_vulns: number;
}

export interface CoverageBlock {
  runs: number;
  /** Runs no longer pending */
  attempted: number;
  done: number;
  failed: number;
  skipped: number;
  pending: number;
  /** Run errors with how many runs ended on each */
  failure_reasons: Record<string, number>;
  skip_reasons: Record<string, number>;
}

/** Run states of one snapshot of the grid. */
export interface GridCoverageRow {
  /** YYYY-MM-DD, null for HEAD */
  grid_date: string | null;
  runs: number;
  /** Done with rows */
  done: number;
  /** Done but empty: no lockfile yet at that date */
  empty: number;
  failed: number;
  skipped: number;
  pending: number;
  /** Its runs were matched against different knowledge */
  mixed_knowledge: boolean;
}

/** A lag distribution in days. */
export interface LagSummary {
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  /** Lags below zero: fixed before the advisory was published */
  before_disclosure: number;
}

/** One group of a lag block: a severity class or a fix kind. */
export interface LagGroup extends LagSummary {
  key: string;
}

export interface FixLagPoint {
  severity: keyof SeverityCounts;
  kind: FixKind | null;
  lag_days: number;
  precision: DatingPrecision;
}

/** Disclosure to fix, over fixes whose advisory has a publication date. */
export interface FixLagBlock {
  /** Every fix, with or without a lag */
  fixes: number;
  /** Share of fixes only dated to a snapshot interval */
  snapshot_precision_share: number | null;
  overall: LagSummary;
  /** Severity order, groups without fixes left out */
  by_severity: LagGroup[];
  /** Fix kind order, then "unknown" for fixes whose kind is not known */
  by_kind: LagGroup[];
  points: FixLagPoint[];
}

export interface ExposuresBlock {
  exposures: number;
  open: number;
  fixed: number;
  introductions: number;
  /** Present at the first observation: no introduction */
  present_at_first_observation: number;
  fix_precision: Record<DatingPrecision, number>;
  introduction_precision: Record<DatingPrecision, number>;
}

/** Events by how fix probes ended; not_probed while they have not. */
export interface ProbeOutcomeCounts {
  found: number;
  ambiguous: number;
  not_found: number;
  not_probed: number;
}

export interface ProbesBlock {
  fixes: ProbeOutcomeCounts;
  introductions: ProbeOutcomeCounts;
  /** Not-found events per reason, most frequent first */
  not_found_reasons: Record<string, number>;
  budget: ProbeBudget;
}

/** The analysis budget, what was submitted against it and whether it is spent. */
export interface ProbeBudget {
  analysis_budget: number | null;
  analyses_submitted: number | null;
  spent: boolean;
}

export interface ProvenanceBlock extends ResultsProvenanceInput {
  /** Knowledge sources differ between the start and end snapshots */
  knowledge_changed: boolean;
  /** How the bootstrap intervals are computed */
  bootstrap: typeof BOOTSTRAP_SETTINGS;
}

/**
 * The results of an experiment (GET .../results, results.json). Blocks are
 * named as in the harness results_numbers.json.
 */
export interface ExperimentResults {
  coverage: CoverageBlock;
  /** Coverage per grid date, oldest first, HEAD last */
  grid_coverage: GridCoverageRow[];
  headline: Headline;
  sweep: SweepRow[];
  /** 95% Wilson intervals of every share in the results */
  share_intervals: ShareIntervals;
  epss: EpssBlock;
  /** Instances per conflict flag, most frequent first */
  match_flags: Record<string, number>;
  /** Instances per winning source, most frequent first */
  winning_source_head: Record<string, number>;
  rqc: RqcBlock;
  rqd: RqdRow[];
  /** Exposures and fixes over the whole grid (hindsight view) */
  exposures: ExposuresBlock;
  fix_lag: FixLagBlock;
  /** How fix probes dated the fixes and introductions */
  probes: ProbesBlock;
  /** Instances per grid date in the hindsight and as-of views, HEAD last */
  load_over_time: LoadRow[];
  /** Introduction to disclosure, introductions after it apart */
  residence: ResidenceBlock;
  /** Kaplan-Meier survival of exposures, open ones censored at HEAD */
  exposure_survival: ExposureSurvivalBlock;
  /** Packages to clear per grid date, removed_transitive share per interval */
  upstream_leverage: UpstreamLeverageBlock;
  /** Bootstrap intervals; null while the experiment has not ended */
  bootstrap_intervals: ResultIntervals | null;
  provenance: ProvenanceBlock;
}

export type { LoadRow } from "./experiment-load";

function nullIfNaN(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function countBy<T>(
  items: readonly T[],
  key: (item: T) => string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Plain code-unit order, as Python sorts strings. */
function byKey(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Entries by count descending, ties by key ascending. */
function rankedEntries(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort(
    ([ka, a], [kb, b]) => b - a || byKey(ka, kb),
  );
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Instances per project (zero-filled over the universe) and per package. */
export function instanceCounts(
  universe: readonly string[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): {
  loadByRun: Map<string, number>;
  packageCounts: number[];
  inUniverse: ResultsVulnerabilityInput[];
} {
  const loadByRun = new Map<string, number>(universe.map((id) => [id, 0]));
  const inUniverse = vulnerabilities.filter((v) => loadByRun.has(v.run_id));
  for (const v of inUniverse) {
    loadByRun.set(v.run_id, (loadByRun.get(v.run_id) ?? 0) + 1);
  }
  return {
    loadByRun,
    packageCounts: [
      ...countBy(inUniverse, (v) => v.affected_dependency).values(),
    ],
    inUniverse,
  };
}

interface HeadlineMeasure {
  headline: Headline;
  intervals: HeadlineShareIntervals;
  severity: ShareIntervals["severity"];
}

/**
 * The headline and its share intervals over a fixed universe of runs: loads are zero-filled over
 * the universe, instances outside it are ignored.
 */
export function measureHeadline(
  universe: readonly string[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): HeadlineMeasure {
  const { loadByRun, packageCounts, inUniverse } = instanceCounts(
    universe,
    vulnerabilities,
  );
  const loads = [...loadByRun.values()];
  const nProjects = loads.length;
  const total = sumOf(loads);
  const nAffected = loads.filter((load) => load > 0).length;

  const instances = sumOf(packageCounts);

  const sevCounts: SeverityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    NONE: 0,
  };
  for (const v of inUniverse) sevCounts[severityOf(v.severity_class)]++;
  const critHigh = sevCounts.CRITICAL + sevCounts.HIGH;

  const runsByPackage = new Map<string, Set<string>>();
  for (const v of inUniverse) {
    if (v.affected_dependency === null) continue;
    const runs = runsByPackage.get(v.affected_dependency) ?? new Set<string>();
    runs.add(v.run_id);
    runsByPackage.set(v.affected_dependency, runs);
  }
  const spread = new Map(
    [...runsByPackage].map(([name, runs]) => [name, runs.size] as const),
  );

  const largestFirst = (values: number[]): number[] =>
    [...values].sort((a, b) => b - a);

  const result: Headline = {
    n_projects: nProjects,
    n_affected: nAffected,
    affected_share: ratio(nAffected, nProjects),
    instances,
    distinct_vuln_packages: packageCounts.length,
    load_median: nullIfNaN(median(loads)),
    load_mean: nProjects ? total / nProjects : null,
    load_max: nProjects ? Math.max(...loads) : null,
    sev_counts: sevCounts,
    high_critical_share: ratio(critHigh, instances),
    top10_pkg_share: ratio(
      sumOf(largestFirst(packageCounts).slice(0, 10)),
      instances,
    ),
    top10_proj_share: ratio(sumOf(largestFirst(loads).slice(0, 10)), total),
    gini_pkg: nullIfNaN(gini(packageCounts)),
    gini_proj: nullIfNaN(gini(loads)),
    pkgs_clear_50: packagesToClear(packageCounts, 0.5),
    pkgs_clear_80: packagesToClear(packageCounts, 0.8),
    pkgs_clear_90: packagesToClear(packageCounts, 0.9),
    top_packages: rankedEntries(spread).slice(0, 10),
    high_critical_share_of_classed: ratio(critHigh, instances - sevCounts.NONE),
  };

  const classified = sumOf(Object.values(sevCounts));
  return {
    headline: result,
    intervals: {
      affected_share: wilsonInterval(nAffected, nProjects),
      high_critical_share: wilsonInterval(critHigh, instances),
      top10_pkg_share: wilsonInterval(
        sumOf(largestFirst(packageCounts).slice(0, 10)),
        instances,
      ),
      top10_proj_share: wilsonInterval(
        sumOf(largestFirst(loads).slice(0, 10)),
        total,
      ),
      high_critical_share_of_classed: wilsonInterval(
        critHigh,
        instances - sevCounts.NONE,
      ),
    },
    severity: {
      CRITICAL: wilsonInterval(sevCounts.CRITICAL, classified),
      HIGH: wilsonInterval(sevCounts.HIGH, classified),
      MEDIUM: wilsonInterval(sevCounts.MEDIUM, classified),
      LOW: wilsonInterval(sevCounts.LOW, classified),
      NONE: wilsonInterval(sevCounts.NONE, classified),
    },
  };
}

export const SWEEP_FILTERS: Record<
  SweepSubset,
  (v: ResultsVulnerabilityInput) => boolean
> = {
  all: () => true,
  match_correct_only: (v) => v.conflict_flag === "MATCH_CORRECT",
  non_withdrawn: (v) => v.withdrawn_date === null || v.withdrawn_date === "",
};

function scalars(h: Headline): HeadlineScalars {
  const {
    sev_counts: _sev,
    top_packages: _top,
    high_critical_share_of_classed: _classed,
    ...rest
  } = h;
  return rest;
}

function measureSweep(
  universe: readonly string[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): (HeadlineMeasure & { subset: SweepSubset })[] {
  return SWEEP_SUBSETS.map((subset) => ({
    subset,
    ...measureHeadline(universe, vulnerabilities.filter(SWEEP_FILTERS[subset])),
  }));
}

/** A sweep row's intervals: the headline's without the of-classed share. */
function sweepIntervals(
  subset: SweepSubset,
  intervals: HeadlineShareIntervals,
): SweepShareIntervals {
  const { high_critical_share_of_classed: _classed, ...rest } = intervals;
  return { subset, ...rest };
}

function epss(
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): EpssBlock {
  const scores: number[] = [];
  let missingCve = 0;
  let missingNonCve = 0;
  for (const v of vulnerabilities) {
    if (v.epss_score !== null) scores.push(v.epss_score);
    else if (v.vulnerability_id?.startsWith("CVE-")) missingCve++;
    else missingNonCve++;
  }
  return {
    nonnull_share: ratio(scores.length, vulnerabilities.length),
    median: nullIfNaN(median(scores)),
    p90: nullIfNaN(quantile(scores, 0.9)),
    over_10pct: scores.filter((score) => score > 0.1).length,
    over_50pct: scores.filter((score) => score > 0.5).length,
    missing_non_cve: missingNonCve,
    missing_cve: missingCve,
  };
}

function mix<T>(
  items: readonly T[],
  key: (item: T) => string | null,
): Record<string, number> {
  return Object.fromEntries(rankedEntries(countBy(items, key)));
}

function rqc(summaries: readonly ResultsSummaryInput[]): RqcBlock {
  const withDeps = summaries.filter((s) => s.total_dependencies > 0);
  const { rho, p } = spearman(
    withDeps.map((s) => s.rank),
    withDeps.map((s) => s.total_vulnerabilities),
  );
  return {
    spearman_rho: nullIfNaN(rho),
    p: nullIfNaN(p),
    n: withDeps.length,
    excluded_zero_dep_projects: summaries.length - withDeps.length,
  };
}

function rqd(summaries: readonly ResultsSummaryInput[]): RqdRow[] {
  const byManager = new Map<string, ResultsSummaryInput[]>();
  for (const s of summaries) {
    if (s.package_manager === null) continue;
    const group = byManager.get(s.package_manager) ?? [];
    group.push(s);
    byManager.set(s.package_manager, group);
  }
  return [...byManager.keys()].sort(byKey).map((manager) => {
    const group = byManager.get(manager) ?? [];
    return {
      package_manager: manager,
      projects: group.length,
      med_deps: median(group.map((s) => s.total_dependencies)),
      med_vulns: median(group.map((s) => s.total_vulnerabilities)),
    };
  });
}

function coverage(runs: readonly ResultsRunInput[]): CoverageBlock {
  const byStatus = countBy(runs, (run) => run.status);
  const reasons = (status: string): Record<string, number> =>
    mix(
      runs.filter((run) => run.status === status),
      (run) => run.error ?? "unknown",
    );
  const pending = byStatus.get("pending") ?? 0;
  return {
    runs: runs.length,
    attempted: runs.length - pending,
    done: byStatus.get("done") ?? 0,
    failed: byStatus.get("failed") ?? 0,
    skipped: byStatus.get("skipped") ?? 0,
    pending,
    failure_reasons: reasons("failed"),
    skip_reasons: reasons("skipped"),
  };
}

function gridCoverage(runs: readonly ResultsRunInput[]): GridCoverageRow[] {
  return groupByGridDate(runs).map(({ grid_date, runs: group }) => {
    const row: GridCoverageRow = {
      grid_date,
      runs: group.length,
      done: 0,
      empty: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      mixed_knowledge: false,
    };
    // The first knowledge seen, to compare the others with
    let first: KnowledgeSnapshot | null = null;
    for (const run of group) {
      if (run.knowledge) {
        if (!first) first = run.knowledge;
        else if (!sameKnowledge(first, run.knowledge))
          row.mixed_knowledge = true;
      }
      if (run.status === "done") {
        if (run.error === NO_LOCKFILE_YET) row.empty++;
        else row.done++;
      } else if (run.status === "failed") row.failed++;
      else if (run.status === "skipped") row.skipped++;
      else row.pending++;
    }
    return row;
  });
}

function lagSummary(lags: readonly number[]): LagSummary {
  const stat = (value: number): number | null => nullIfNaN(value);
  return {
    n: lags.length,
    median: stat(median(lags)),
    p25: stat(quantile(lags, 0.25)),
    p75: stat(quantile(lags, 0.75)),
    min: lags.length ? Math.min(...lags) : null,
    max: lags.length ? Math.max(...lags) : null,
    before_disclosure: lags.filter((lag) => lag < 0).length,
  };
}

function lagGroups(
  points: readonly FixLagPoint[],
  keys: readonly string[],
  keyOf: (point: FixLagPoint) => string,
): LagGroup[] {
  return keys
    .map((key) => ({
      key,
      ...lagSummary(
        points.filter((p) => keyOf(p) === key).map((p) => p.lag_days),
      ),
    }))
    .filter((group) => group.n > 0);
}

function fixLag(exposures: readonly Exposure[]): FixLagBlock {
  const fixes = exposures.flatMap((e) =>
    e.fix ? [{ ...e.fix, severity: e.severity }] : [],
  );
  const points: FixLagPoint[] = fixes.flatMap((fix) =>
    fix.lag_days === null
      ? []
      : [
          {
            severity: fix.severity,
            kind: fix.kind,
            lag_days: fix.lag_days,
            precision: fix.precision,
          },
        ],
  );
  return {
    fixes: fixes.length,
    snapshot_precision_share: ratio(
      fixes.filter((fix) => fix.precision === "snapshot").length,
      fixes.length,
    ),
    overall: lagSummary(points.map((p) => p.lag_days)),
    by_severity: lagGroups(points, SEVERITY_ORDER, (p) => p.severity),
    by_kind: lagGroups(
      points,
      [...FIX_KINDS, "unknown"],
      (p) => p.kind ?? "unknown",
    ),
    points,
  };
}

function exposuresBlock(exposures: readonly Exposure[]): ExposuresBlock {
  const precision = (
    events: readonly ({ precision: DatingPrecision } | null)[],
  ): Record<DatingPrecision, number> => ({
    commit: events.filter((e) => e?.precision === "commit").length,
    snapshot: events.filter((e) => e?.precision === "snapshot").length,
  });
  return {
    exposures: exposures.length,
    open: exposures.filter((e) => e.open).length,
    fixed: exposures.filter((e) => e.fix).length,
    introductions: exposures.filter((e) => e.introduction).length,
    present_at_first_observation: exposures.filter((e) => !e.introduction)
      .length,
    fix_precision: precision(exposures.map((e) => e.fix)),
    introduction_precision: precision(exposures.map((e) => e.introduction)),
  };
}

function probesBlock(
  exposures: readonly Exposure[],
  budget: AnalysisBudgetUsage | null | undefined,
): ProbesBlock {
  const counts = (events: readonly ExposureEvent[]): ProbeOutcomeCounts => ({
    found: events.filter((e) => e.probe_outcome === "found").length,
    ambiguous: events.filter((e) => e.probe_outcome === "ambiguous").length,
    not_found: events.filter((e) => e.probe_outcome === "not_found").length,
    not_probed: events.filter((e) => e.probe_outcome === null).length,
  });
  const fixes = exposures.flatMap((e) => (e.fix ? [e.fix] : []));
  const introductions = exposures.flatMap((e) =>
    e.introduction ? [e.introduction] : [],
  );
  const notFound = [...fixes, ...introductions].filter(
    (e) => e.probe_outcome === "not_found",
  );
  return {
    fixes: counts(fixes),
    introductions: counts(introductions),
    not_found_reasons: Object.fromEntries(
      rankedEntries(countBy(notFound, (e) => e.probe_reason)),
    ),
    budget: {
      analysis_budget: budget?.analysis_budget ?? null,
      analyses_submitted: budget?.analyses_submitted ?? null,
      spent: isBudgetSpent(budget),
    },
  };
}

/** The same EPSS row count and the same timestamps for sources in both snapshots. */
function sameKnowledge(a: KnowledgeSnapshot, b: KnowledgeSnapshot): boolean {
  if (a.epss_rows !== b.epss_rows) return false;
  return Object.keys(a.knowledge_sources)
    .filter((key) => key in b.knowledge_sources)
    .every(
      (key) =>
        (a.knowledge_sources[key] ?? null) ===
        (b.knowledge_sources[key] ?? null),
    );
}

function provenance(input: ResultsProvenanceInput): ProvenanceBlock {
  const { knowledge_start: start, knowledge_end: end } = input;
  return {
    ...input,
    knowledge_changed:
      start !== null && end !== null && !sameKnowledge(start, end),
    bootstrap: BOOTSTRAP_SETTINGS,
  };
}

/** HEAD's date: when the experiment ended, else the time the results are read. */
export function headCutoff(ended_on: Date | null, readAt: Date): Date {
  return ended_on ?? readAt;
}

/** The summaries HEAD reads: each project once, even when rows are shared. */
export function headSummaries(
  runs: readonly ResultsRunInput[],
  summaries: readonly ResultsSummaryInput[],
): ResultsSummaryInput[] {
  const gridOnly = gridOnlyRunIds(runs);
  return summaries.filter((s) => !gridOnly.has(s.run_id));
}

/** Run ids whose rows only grid snapshots read: outside the HEAD blocks. */
function gridOnlyRunIds(runs: readonly ResultsRunInput[]): Set<string> {
  const headRows = new Set<string>();
  const gridRows = new Set<string>();
  for (const run of runs) {
    if (run.rows_run_id === undefined) continue;
    (isHead(run) ? headRows : gridRows).add(run.rows_run_id);
  }
  return new Set([...gridRows].filter((id) => !headRows.has(id)));
}

/**
 * Every aggregate of an experiment. HEAD blocks use HEAD's done runs as the
 * project universe (load 0 without instances); grid blocks use every run.
 */
export function aggregateExperimentResults(
  input: ExperimentResultsInput,
): ExperimentResults {
  const exposures = deriveExposures(input);
  const head = headCutoff(
    input.provenance.ended_on,
    input.read_at ?? new Date(),
  );
  const summaries = headSummaries(input.runs, input.summaries);
  const universe = summaries.map((s) => s.run_id);
  const inUniverse = new Set(universe);
  const vulnerabilities = input.vulnerabilities.filter((v) =>
    inUniverse.has(v.run_id),
  );
  const headMeasure = measureHeadline(universe, vulnerabilities);
  const sweepMeasures = measureSweep(universe, vulnerabilities);
  const exposuresSummary = exposuresBlock(exposures);
  const leverage = upstreamLeverage(
    input.runs,
    input.vulnerabilities,
    exposures,
  );
  return {
    coverage: coverage(input.runs.filter(isHead)),
    grid_coverage: gridCoverage(input.runs),
    headline: headMeasure.headline,
    sweep: sweepMeasures.map((m) => ({
      subset: m.subset,
      ...scalars(m.headline),
    })),
    share_intervals: {
      headline: headMeasure.intervals,
      sweep: sweepMeasures.map((m) => sweepIntervals(m.subset, m.intervals)),
      severity: headMeasure.severity,
      epss_nonnull: wilsonInterval(
        vulnerabilities.filter((v) => v.epss_score !== null).length,
        vulnerabilities.length,
      ),
      fix_snapshot_precision: wilsonInterval(
        exposuresSummary.fix_precision.snapshot,
        exposuresSummary.fixed,
      ),
      introduction_snapshot_precision: wilsonInterval(
        exposuresSummary.introduction_precision.snapshot,
        exposuresSummary.introductions,
      ),
      removed_transitive: {
        overall: transitiveInterval(leverage.overall),
        by_interval: leverage.fix_kinds.map(transitiveInterval),
      },
    },
    epss: epss(vulnerabilities),
    match_flags: mix(vulnerabilities, (v) => v.conflict_flag),
    winning_source_head: mix(vulnerabilities, (v) => v.winning_source),
    rqc: rqc(summaries),
    rqd: rqd(summaries),
    exposures: exposuresSummary,
    fix_lag: fixLag(exposures),
    probes: probesBlock(exposures, input.budget),
    load_over_time: loadOverTime({
      runs: input.runs,
      vulnerabilities: input.vulnerabilities,
      head_cutoff: head,
    }),
    residence: residenceBlock(exposures),
    exposure_survival: exposureSurvival(exposures, head),
    upstream_leverage: leverage,
    bootstrap_intervals:
      input.bootstrap_intervals === undefined
        ? computeResultIntervals(input)
        : input.bootstrap_intervals,
    provenance: provenance(input.provenance),
  };
}

/** The removed_transitive share's interval: transitive over fixes of known kind. */
function transitiveInterval(counts: FixKindCounts): ConfidenceInterval | null {
  return wilsonInterval(
    counts.removed_transitive,
    counts.fixes - counts.unknown,
  );
}

/** The bootstrap intervals of the results, for the HEAD universe of projects. */
function intervalSteps(input: ExperimentResultsInput): Steps<ResultIntervals> {
  const gridOnly = gridOnlyRunIds(input.runs);
  const summaries = input.summaries.filter((s) => !gridOnly.has(s.run_id));
  const inUniverse = new Set(summaries.map((s) => s.run_id));
  return resultIntervalsSteps({
    summaries,
    vulnerabilities: input.vulnerabilities.filter((v) =>
      inUniverse.has(v.run_id),
    ),
    exposures: deriveExposures(input),
    sweep_filters: SWEEP_FILTERS,
  });
}

export function computeResultIntervals(
  input: ExperimentResultsInput,
): ResultIntervals {
  return runSteps(intervalSteps(input));
}

/** The same intervals as computeResultIntervals, computed without blocking other requests. */
export function computeResultIntervalsYielding(
  input: ExperimentResultsInput,
): Promise<ResultIntervals> {
  return runYielding(intervalSteps(input));
}
