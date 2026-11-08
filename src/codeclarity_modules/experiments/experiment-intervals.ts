/** Bootstrap intervals of the results' medians and Gini coefficients. Pure. */
import type { Exposure } from "./experiment-exposures";
import type {
  ResultsSummaryInput,
  ResultsVulnerabilityInput,
  SweepSubset,
} from "./experiment-results";
import {
  bootstrapGiniOfTotalsSteps,
  bootstrapGiniSteps,
  type BootstrapInterval,
  bootstrapMedianSteps,
  type BootstrapSettings,
  type Steps,
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

function* concentration(
  summaries: readonly ResultsSummaryInput[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): Steps<ConcentrationIntervals> {
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
    load_median: yield* bootstrapMedianSteps(loads, BOOTSTRAP_SETTINGS),
    gini_pkg: yield* bootstrapGiniOfTotalsSteps(packages, BOOTSTRAP_SETTINGS),
    gini_proj: yield* bootstrapGiniSteps(loads, BOOTSTRAP_SETTINGS),
  };
}

/** A value measured on one exposure of a project, with its group. */
interface ProjectValue {
  project: string;
  group: string;
  value: number;
}

function* medianOf(
  values: readonly ProjectValue[],
): Steps<BootstrapInterval | null> {
  const clusters = new Map<string, number[]>();
  for (const { project, value } of values) {
    const cluster = clusters.get(project) ?? [];
    cluster.push(value);
    clusters.set(project, cluster);
  }
  return yield* bootstrapMedianSteps(clusters, BOOTSTRAP_SETTINGS);
}

function* mediansByGroup(
  values: readonly ProjectValue[],
): Steps<GroupIntervals> {
  const groups: GroupIntervals = {};
  for (const group of new Set(values.map((v) => v.group))) {
    groups[group] = yield* medianOf(values.filter((v) => v.group === group));
  }
  return groups;
}

function* fixLag(
  exposures: readonly Exposure[],
): Steps<ResultIntervals["fix_lag"]> {
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
    overall: yield* medianOf(lags(() => "")),
    by_severity: yield* mediansByGroup(lags((fix) => fix.exposure.severity)),
    by_kind: yield* mediansByGroup(lags((fix) => fix.kind ?? "unknown")),
  };
}

function* residence(
  exposures: readonly Exposure[],
): Steps<ResultIntervals["residence"]> {
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
    overall: yield* medianOf(before),
    by_severity: yield* mediansByGroup(before),
    after_disclosure: yield* medianOf(after),
    after_disclosure_by_severity: yield* mediansByGroup(after),
  };
}

function epssMedian(
  summaries: readonly ResultsSummaryInput[],
  vulnerabilities: readonly ResultsVulnerabilityInput[],
): Steps<BootstrapInterval | null> {
  const rankByRun = new Map(summaries.map((s) => [s.run_id, s.rank]));
  const scores = new Map<number, number[]>();
  for (const v of vulnerabilities) {
    const rank = rankByRun.get(v.run_id);
    if (rank === undefined || v.epss_score === null) continue;
    const cluster = scores.get(rank) ?? [];
    cluster.push(v.epss_score);
    scores.set(rank, cluster);
  }
  return bootstrapMedianSteps(scores, BOOTSTRAP_SETTINGS);
}

function* rqd(
  summaries: readonly ResultsSummaryInput[],
): Steps<ResultIntervals["rqd"]> {
  const managers = new Set(summaries.map((s) => s.package_manager));
  managers.delete(null);
  const median = (
    group: readonly ResultsSummaryInput[],
    value: (s: ResultsSummaryInput) => number,
  ): Steps<BootstrapInterval | null> =>
    bootstrapMedianSteps(
      new Map(group.map((s) => [s.rank, [value(s)]])),
      BOOTSTRAP_SETTINGS,
    );
  const result: ResultIntervals["rqd"] = {};
  for (const manager of managers) {
    const group = summaries.filter((s) => s.package_manager === manager);
    result[manager!] = {
      med_deps: yield* median(group, (s) => s.total_dependencies),
      med_vulns: yield* median(group, (s) => s.total_vulnerabilities),
    };
  }
  return result;
}

export function* resultIntervalsSteps(
  rows: IntervalRows,
): Steps<ResultIntervals> {
  const {
    summaries,
    vulnerabilities,
    exposures,
    sweep_filters: filters,
  } = rows;
  const sweep = {
    all: yield* concentration(summaries, vulnerabilities.filter(filters.all)),
    match_correct_only: yield* concentration(
      summaries,
      vulnerabilities.filter(filters.match_correct_only),
    ),
    non_withdrawn: yield* concentration(
      summaries,
      vulnerabilities.filter(filters.non_withdrawn),
    ),
  };
  return {
    headline: sweep.all,
    sweep,
    epss_median: yield* epssMedian(summaries, vulnerabilities),
    rqd: yield* rqd(summaries),
    fix_lag: yield* fixLag(exposures),
    residence: yield* residence(exposures),
  };
}

/** How long a computation may hold the event loop before letting other work run. */
const SLICE_MS = 15;

/** Runs a computation in slices, giving the event loop a turn between them. */
export async function runYielding<T>(steps: Steps<T>): Promise<T> {
  let sliceStart = Date.now();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    if (Date.now() - sliceStart < SLICE_MS) continue;
    await new Promise<void>((resolve) => setImmediate(resolve));
    sliceStart = Date.now();
  }
}
