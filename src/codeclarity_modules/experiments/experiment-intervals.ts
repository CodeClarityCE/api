/** Bootstrap intervals of the results' medians and Gini coefficients. Pure. */
import type { Exposure } from "./experiment-exposures";
import type {
  ResultsSummaryInput,
  ResultsVulnerabilityInput,
  SweepSubset,
} from "./experiment-results";
import {
  bootstrapGini,
  bootstrapGiniOfTotals,
  type BootstrapInterval,
  bootstrapMedian,
  type BootstrapSettings,
} from "./experiment-stats";

/** The bootstrap method, also reported in the results provenance. */
export const BOOTSTRAP_SETTINGS = {
  method: "percentile bootstrap, resampling by project",
  confidence: 0.95,
  resamples: 10_000,
  seed: 20_260_611,
} as const satisfies BootstrapSettings & { method: string };

export interface ConcentrationIntervals {
  load_median: BootstrapInterval | null;
  gini_pkg: BootstrapInterval | null;
  gini_proj: BootstrapInterval | null;
}

/** Medians over a whole set and per group key. */
type GroupIntervals = Record<string, BootstrapInterval | null>;

export interface ResultIntervals {
  headline: ConcentrationIntervals;
  sweep: Record<SweepSubset, ConcentrationIntervals>;
  epss_median: BootstrapInterval | null;
  /** Per package manager */
  rqd: Record<
    string,
    {
      med_deps: BootstrapInterval | null;
      med_vulns: BootstrapInterval | null;
    }
  >;
  fix_lag: {
    overall: BootstrapInterval | null;
    by_severity: GroupIntervals;
    by_kind: GroupIntervals;
  };
  residence: {
    overall: BootstrapInterval | null;
    by_severity: GroupIntervals;
    after_disclosure: BootstrapInterval | null;
    after_disclosure_by_severity: GroupIntervals;
  };
}

interface IntervalRows {
  /** The HEAD universe: one per project */
  summaries: readonly ResultsSummaryInput[];
  vulnerabilities: readonly ResultsVulnerabilityInput[];
  exposures: readonly Exposure[];
  sweep_filters: Record<SweepSubset, (v: ResultsVulnerabilityInput) => boolean>;
}

function concentration(
  summaries: readonly ResultsSummaryInput[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): ConcentrationIntervals {
  const rankByRun = new Map(summaries.map((s) => [s.run_id, s.rank]));
  const loads = new Map<number, number[]>(summaries.map((s) => [s.rank, [0]]));
  const packages = new Map<number, Map<string, number>>(
    summaries.map((s) => [s.rank, new Map()]),
  );
  for (const v of vulnerabilities) {
    const rank = rankByRun.get(v.run_id);
    if (rank === undefined) continue;
    loads.get(rank)![0]!++;
    if (v.affected_dependency === null) continue;
    const counts = packages.get(rank)!;
    counts.set(
      v.affected_dependency,
      (counts.get(v.affected_dependency) ?? 0) + 1,
    );
  }
  return {
    load_median: bootstrapMedian(loads, BOOTSTRAP_SETTINGS),
    gini_pkg: bootstrapGiniOfTotals(packages, BOOTSTRAP_SETTINGS),
    gini_proj: bootstrapGini(loads, BOOTSTRAP_SETTINGS),
  };
}

/** A value measured on one exposure of a project, with its group. */
interface ProjectValue {
  project: string;
  group: string;
  value: number;
}

function medianOf(values: readonly ProjectValue[]): BootstrapInterval | null {
  const clusters = new Map<string, number[]>();
  for (const { project, value } of values) {
    const cluster = clusters.get(project) ?? [];
    cluster.push(value);
    clusters.set(project, cluster);
  }
  return bootstrapMedian(clusters, BOOTSTRAP_SETTINGS);
}

function mediansByGroup(values: readonly ProjectValue[]): GroupIntervals {
  const groups = [...new Set(values.map((v) => v.group))];
  return Object.fromEntries(
    groups.map((group) => [
      group,
      medianOf(values.filter((v) => v.group === group)),
    ]),
  );
}

function fixLag(exposures: readonly Exposure[]): ResultIntervals["fix_lag"] {
  const fixes = exposures.flatMap((e) =>
    e.fix?.lag_days === null || e.fix?.lag_days === undefined
      ? []
      : [{ exposure: e, kind: e.fix.kind, lag: e.fix.lag_days }],
  );
  const lags = (
    group: (fix: (typeof fixes)[number]) => string,
  ): ProjectValue[] =>
    fixes.map((fix) => ({
      project: fix.exposure.dataset_entry_id,
      group: group(fix),
      value: fix.lag,
    }));
  return {
    overall: medianOf(lags(() => "")),
    by_severity: mediansByGroup(lags((fix) => fix.exposure.severity)),
    by_kind: mediansByGroup(lags((fix) => fix.kind ?? "unknown")),
  };
}

function residence(
  exposures: readonly Exposure[],
): ResultIntervals["residence"] {
  const dated = exposures.flatMap((e) => {
    const days = e.introduction?.residence_days;
    return days === null || days === undefined
      ? []
      : [{ project: e.dataset_entry_id, group: e.severity, value: days }];
  });
  const before = dated.filter((d) => d.value >= 0);
  const after = dated
    .filter((d) => d.value < 0)
    .map((d) => ({ ...d, value: -d.value }));
  return {
    overall: medianOf(before),
    by_severity: mediansByGroup(before),
    after_disclosure: medianOf(after),
    after_disclosure_by_severity: mediansByGroup(after),
  };
}

function epssMedian(
  summaries: readonly ResultsSummaryInput[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): BootstrapInterval | null {
  const rankByRun = new Map(summaries.map((s) => [s.run_id, s.rank]));
  const scores = new Map<number, number[]>();
  for (const v of vulnerabilities) {
    const rank = rankByRun.get(v.run_id);
    if (rank === undefined || v.epss_score === null) continue;
    const cluster = scores.get(rank) ?? [];
    cluster.push(v.epss_score);
    scores.set(rank, cluster);
  }
  return bootstrapMedian(scores, BOOTSTRAP_SETTINGS);
}

function rqd(
  summaries: readonly ResultsSummaryInput[],
): ResultIntervals["rqd"] {
  const managers = new Set(summaries.map((s) => s.package_manager));
  managers.delete(null);
  const median = (
    group: readonly ResultsSummaryInput[],
    value: (s: ResultsSummaryInput) => number,
  ): BootstrapInterval | null =>
    bootstrapMedian(
      new Map(group.map((s) => [s.rank, [value(s)]])),
      BOOTSTRAP_SETTINGS,
    );
  return Object.fromEntries(
    [...managers].map((manager) => {
      const group = summaries.filter((s) => s.package_manager === manager);
      return [
        manager!,
        {
          med_deps: median(group, (s) => s.total_dependencies),
          med_vulns: median(group, (s) => s.total_vulnerabilities),
        },
      ];
    }),
  );
}

export function resultIntervals(rows: IntervalRows): ResultIntervals {
  const {
    summaries,
    vulnerabilities,
    exposures,
    sweep_filters: filters,
  } = rows;
  const sweep = {
    all: concentration(summaries, vulnerabilities.filter(filters.all)),
    match_correct_only: concentration(
      summaries,
      vulnerabilities.filter(filters.match_correct_only),
    ),
    non_withdrawn: concentration(
      summaries,
      vulnerabilities.filter(filters.non_withdrawn),
    ),
  };
  return {
    headline: sweep.all,
    sweep,
    epss_median: epssMedian(summaries, vulnerabilities),
    rqd: rqd(summaries),
    fix_lag: fixLag(exposures),
    residence: residence(exposures),
  };
}
