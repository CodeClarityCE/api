/**
 * Experiment results (spec #23, "Data and results"): the dataset-level
 * aggregates of an experiment, computed on read from its tidy rows. Block
 * names and semantics follow the archived js-vuln-study harness
 * (numbers.py, stats.py) so the payload is shaped like its
 * results_numbers.json, minus the blocks v1 drops.
 *
 * Pure and free of Nest and TypeORM imports: the results endpoint, the
 * results.json export and the parity test all call
 * aggregateExperimentResults with plain rows. Where the harness produced
 * NaN the payload carries null.
 */
import type { RunSummaryRow, VulnerabilityInstanceRow } from "./experiment-row-copy";
import {
  gini,
  median,
  packagesToClear,
  quantile,
  spearman,
} from "./experiment-stats";

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
> & { run_id: string };

/** Any run of the experiment, done or not, for coverage. */
export interface ResultsRunInput {
  status: string;
  error: string | null;
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
  provenance: ResultsProvenanceInput;
}

export const SEVERITY_ORDER = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NONE",
] as const;
export type SeverityCounts = Record<(typeof SEVERITY_ORDER)[number], number>;

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

export interface ProvenanceBlock extends ResultsProvenanceInput {
  /** Knowledge sources differ between the start and end snapshots */
  knowledge_changed: boolean;
}

/**
 * The results of an experiment (GET .../results, results.json). Blocks are
 * named as in the harness results_numbers.json.
 */
export interface ExperimentResults {
  coverage: CoverageBlock;
  headline: Headline;
  sweep: SweepRow[];
  epss: EpssBlock;
  /** Instances per conflict flag, most frequent first */
  match_flags: Record<string, number>;
  /** Instances per winning source, most frequent first */
  winning_source_head: Record<string, number>;
  rqc: RqcBlock;
  rqd: RqdRow[];
  provenance: ProvenanceBlock;
}

function nullIfNaN(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function countBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string, number> {
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

function severityOf(severityClass: string | null): keyof SeverityCounts {
  const upper = (severityClass ?? "").toUpperCase();
  return (SEVERITY_ORDER as readonly string[]).includes(upper)
    ? (upper as keyof SeverityCounts)
    : "NONE";
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * The headline over a fixed universe of runs: loads are zero-filled over
 * the universe, instances outside it are ignored.
 */
export function headline(
  universe: readonly string[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): Headline {
  const loadByRun = new Map<string, number>(universe.map((id) => [id, 0]));
  const inUniverse = vulnerabilities.filter((v) => loadByRun.has(v.run_id));
  for (const v of inUniverse) {
    loadByRun.set(v.run_id, (loadByRun.get(v.run_id) ?? 0) + 1);
  }
  const loads = [...loadByRun.values()];
  const nProjects = loads.length;
  const total = sumOf(loads);
  const nAffected = loads.filter((load) => load > 0).length;

  const packageCounts = [
    ...countBy(inUniverse, (v) => v.affected_dependency).values(),
  ];
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

  return {
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
    top10_pkg_share: ratio(sumOf(largestFirst(packageCounts).slice(0, 10)), instances),
    top10_proj_share: ratio(sumOf(largestFirst(loads).slice(0, 10)), total),
    gini_pkg: nullIfNaN(gini(packageCounts)),
    gini_proj: nullIfNaN(gini(loads)),
    pkgs_clear_50: packagesToClear(packageCounts, 0.5),
    pkgs_clear_80: packagesToClear(packageCounts, 0.8),
    pkgs_clear_90: packagesToClear(packageCounts, 0.9),
    top_packages: rankedEntries(spread).slice(0, 10),
    high_critical_share_of_classed: ratio(
      critHigh,
      instances - sevCounts.NONE,
    ),
  };
}

const SWEEP_FILTERS: Record<
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

function sweep(
  universe: readonly string[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): SweepRow[] {
  return SWEEP_SUBSETS.map((subset) => ({
    subset,
    ...scalars(
      headline(universe, vulnerabilities.filter(SWEEP_FILTERS[subset])),
    ),
  }));
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

/** The same source timestamps and the same number of EPSS rows. */
function sameKnowledge(a: KnowledgeSnapshot, b: KnowledgeSnapshot): boolean {
  if (a.epss_rows !== b.epss_rows) return false;
  const keys = new Set([
    ...Object.keys(a.knowledge_sources),
    ...Object.keys(b.knowledge_sources),
  ]);
  return [...keys].every(
    (key) =>
      (a.knowledge_sources[key] ?? null) === (b.knowledge_sources[key] ?? null),
  );
}

function provenance(input: ResultsProvenanceInput): ProvenanceBlock {
  const { knowledge_start: start, knowledge_end: end } = input;
  return {
    ...input,
    knowledge_changed: start !== null && end !== null && !sameKnowledge(start, end),
  };
}

/**
 * Every aggregate of an experiment, from its runs and tidy rows. The done
 * runs (one summary each) are the project universe: a done run without
 * instances counts with load 0, instances of other runs are ignored.
 */
export function aggregateExperimentResults(
  input: ExperimentResultsInput,
): ExperimentResults {
  const universe = input.summaries.map((s) => s.run_id);
  const inUniverse = new Set(universe);
  const vulnerabilities = input.vulnerabilities.filter((v) =>
    inUniverse.has(v.run_id),
  );
  return {
    coverage: coverage(input.runs),
    headline: headline(universe, vulnerabilities),
    sweep: sweep(universe, vulnerabilities),
    epss: epss(vulnerabilities),
    match_flags: mix(vulnerabilities, (v) => v.conflict_flag),
    winning_source_head: mix(vulnerabilities, (v) => v.winning_source),
    rqc: rqc(input.summaries),
    rqd: rqd(input.summaries),
    provenance: provenance(input.provenance),
  };
}
