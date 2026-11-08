/** The plotted values of a Figure, computed from tidy rows. Pure. */
import {
  deriveExposures,
  type Exposure,
  type ExposuresInput,
  FIX_KINDS,
} from "./experiment-exposures";
import {
  type DateRange,
  type FigureDefinition,
  type FigureMetricId,
  parseDateRange,
} from "./experiment-figure-catalog";
import { gridDay, publishedDay } from "./experiment-grid";
import { loadOverTime, type LoadRow } from "./experiment-load";
import { residenceBlock } from "./experiment-residence";
import {
  headSummaries,
  instanceCounts,
  measureHeadline,
  type ResultsSummaryInput,
  type ResultsVulnerabilityInput,
  SWEEP_FILTERS,
  type SweepSubset,
} from "./experiment-results";
import { SEVERITY_ORDER, type SeverityCounts } from "./experiment-severity";
import { lorenzCurve } from "./experiment-stats";
import { upstreamLeverage } from "./experiment-upstream-leverage";

export interface FigureRows extends ExposuresInput {
  summaries: readonly ResultsSummaryInput[];
  /** HEAD's as-of cutoff, from headCutoff */
  head_cutoff: Date;
}

/** One line of a Figure; a null value leaves a gap. */
export interface FigureSeries {
  key: string;
  label: string;
  values: (number | null)[];
}

export interface FigureData {
  x_title: string;
  y_title: string;
  /** One per point along x */
  labels: string[];
  series: FigureSeries[];
}

const LOAD_VIEWS = [
  { key: "hindsight", label: "Hindsight" },
  { key: "as_of", label: "As-of" },
] as const satisfies readonly { key: keyof LoadRow; label: string }[];

function loadOverTimeFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const load = loadOverTime(rows);
  const view = definition.filters["view"];
  return {
    x_title: "Grid date",
    y_title: "Vulnerability instances",
    labels: load.map((row) => row.grid_date ?? "HEAD"),
    series: LOAD_VIEWS.filter(({ key }) => !view || key === view).map(
      ({ key, label }) => ({
        key,
        label,
        values: load.map((row) => row[key]),
      }),
    ),
  };
}

const SEVERITY_LABELS: Record<keyof SeverityCounts, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "None",
};

function dateRangeOf(definition: FigureDefinition): DateRange | null {
  const value = definition.filters["date_range"];
  return value ? parseDateRange(value) : null;
}

/** Without a range every day counts; with one, an undated event does not. */
function inRange(day: string | null, range: DateRange | null): boolean {
  if (!range) return true;
  if (day === null) return false;
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

/** The instances of the chosen sweep subset, all of them without one. */
function subsetVulnerabilities(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureRows["vulnerabilities"] {
  const subset = definition.filters["sweep_subset"] as SweepSubset | undefined;
  return subset
    ? rows.vulnerabilities.filter(SWEEP_FILTERS[subset])
    : rows.vulnerabilities;
}

function figureExposures(
  rows: FigureRows,
  definition: FigureDefinition,
): Exposure[] {
  return deriveExposures({
    ...rows,
    vulnerabilities: subsetVulnerabilities(rows, definition),
  });
}

const RESIDENCE_BUCKETS = [
  { label: "0-30", max: 30 },
  { label: "31-90", max: 90 },
  { label: "91-180", max: 180 },
  { label: "181-365", max: 365 },
  { label: "366-730", max: 730 },
  { label: "731+", max: Infinity },
] as const;

function residenceFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const precision = definition.filters["dating_precision"];
  const range = dateRangeOf(definition);
  const block = residenceBlock(
    figureExposures(rows, definition).filter(
      ({ introduction }) =>
        introduction !== null &&
        (!precision || introduction.precision === precision) &&
        inRange(introduction.date, range),
    ),
  );
  const bySeverity = definition.group_by === "severity";

  if (definition.chart_form === "quartiles") {
    const groups = bySeverity
      ? block.by_severity.map((group) => ({
          key: group.key,
          label: SEVERITY_LABELS[group.key as keyof SeverityCounts],
          days: group,
        }))
      : [{ key: "residence", label: "Residence", days: block.overall }];
    return {
      x_title: "Quartile",
      y_title: "Days before disclosure",
      labels: ["Min", "P25", "Median", "P75", "Max"],
      series: groups.map(({ key, label, days }) => ({
        key,
        label,
        values: [days.min, days.p25, days.median, days.p75, days.max],
      })),
    };
  }

  const countBuckets = (days: readonly number[]): number[] =>
    RESIDENCE_BUCKETS.map(
      ({ max }, i) =>
        days.filter(
          (day) => day <= max && day > (RESIDENCE_BUCKETS[i - 1]?.max ?? -1),
        ).length,
    );
  const groups = bySeverity
    ? block.by_severity.map(({ key }) => ({
        key,
        label: SEVERITY_LABELS[key as keyof SeverityCounts],
        days: block.points.filter((p) => p.severity === key),
      }))
    : [{ key: "residence", label: "Residence", days: block.points }];
  return {
    x_title: "Days before disclosure",
    y_title: "Introductions",
    labels: RESIDENCE_BUCKETS.map(({ label }) => label),
    series: groups.map(({ key, label, days }) => ({
      key,
      label,
      values: countBuckets(days.map((p) => p.residence_days)),
    })),
  };
}

/** The instances of the sweep subset in the chosen view, at HEAD's cutoff. */
function viewedVulnerabilities(
  rows: FigureRows,
  definition: FigureDefinition,
): readonly ResultsVulnerabilityInput[] {
  const subset = subsetVulnerabilities(rows, definition);
  if (definition.filters["view"] !== "as_of") return subset;
  const cutoff = gridDay(rows.head_cutoff);
  return subset.filter((v) => {
    const published = publishedDay(v.published_date);
    return published === null || published <= cutoff;
  });
}

/** Share of the population at each 5% step of a Lorenz curve. */
const LORENZ_STEPS = Array.from({ length: 21 }, (_, i) => i * 5);

function concentrationFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const universe = headSummaries(rows.runs, rows.summaries).map(
    (s) => s.run_id,
  );
  const { loadByRun, packageCounts } = instanceCounts(
    universe,
    viewedVulnerabilities(rows, definition),
  );
  const curve = (values: readonly number[]): (number | null)[] =>
    lorenzCurve(
      values,
      LORENZ_STEPS.map((step) => step / 100),
    ).map((share) => (share === null ? null : share * 100));
  return {
    x_title: "Share of population (%)",
    y_title: "Cumulative share of instances (%)",
    labels: LORENZ_STEPS.map((step) => `${step}%`),
    series: [
      {
        key: "projects",
        label: "Projects",
        values: curve([...loadByRun.values()]),
      },
      { key: "packages", label: "Packages", values: curve(packageCounts) },
    ],
  };
}

/** Star-rank buckets of a cohort; rank 0 is the most starred. */
const STAR_RANK_BUCKETS = [
  { key: "top_10", label: "Top 10", below: 10 },
  { key: "11_100", label: "11 to 100", below: 100 },
  { key: "101_1000", label: "101 to 1,000", below: 1000 },
  { key: "over_1000", label: "Over 1,000", below: Infinity },
] as const;

const UNKNOWN_GROUP = "Unknown";

/** HEAD's projects split by the group-by, groups without a project left out. */
function headGroups(
  summaries: readonly ResultsSummaryInput[],
  groupBy: string | null,
): { key: string; label: string; runIds: string[] }[] {
  if (groupBy === "star_rank_bucket") {
    return STAR_RANK_BUCKETS.flatMap(({ key, label, below }, i) => {
      const above = i === 0 ? -1 : STAR_RANK_BUCKETS[i - 1]!.below - 1;
      const runIds = summaries
        .filter((s) => s.rank > above && s.rank < below)
        .map((s) => s.run_id);
      return runIds.length ? [{ key, label, runIds }] : [];
    });
  }
  if (groupBy === "package_manager") {
    const managers = [
      ...new Set(summaries.map((s) => s.package_manager ?? UNKNOWN_GROUP)),
    ].sort();
    return managers.map((manager) => ({
      key: manager,
      label: manager,
      runIds: summaries
        .filter((s) => (s.package_manager ?? UNKNOWN_GROUP) === manager)
        .map((s) => s.run_id),
    }));
  }
  return [
    {
      key: "instances",
      label: "Instances",
      runIds: summaries.map((s) => s.run_id),
    },
  ];
}

function severityMixFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const vulnerabilities = viewedVulnerabilities(rows, definition);
  const groups = headGroups(
    headSummaries(rows.runs, rows.summaries),
    definition.group_by,
  );
  return {
    x_title: "Severity",
    y_title: "Vulnerability instances",
    labels: SEVERITY_ORDER.map((severity) => SEVERITY_LABELS[severity]),
    series: groups.map(({ key, label, runIds }) => {
      const counts = measureHeadline(runIds, vulnerabilities).headline
        .sev_counts;
      return {
        key,
        label,
        values: SEVERITY_ORDER.map((severity) => counts[severity]),
      };
    }),
  };
}

function starsVsLoadFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const withDeps = headSummaries(rows.runs, rows.summaries)
    .filter((s) => s.total_dependencies > 0)
    .sort((a, b) => a.rank - b.rank);
  const { sweep_subset: subset, view } = definition.filters;
  const filtered = (subset && subset !== "all") || view === "as_of";
  // The copied total matches the results; filters can only count instances
  const loads = filtered
    ? instanceCounts(
        withDeps.map((s) => s.run_id),
        viewedVulnerabilities(rows, definition),
      ).loadByRun
    : new Map(withDeps.map((s) => [s.run_id, s.total_vulnerabilities]));
  const groups =
    definition.group_by === "package_manager"
      ? headGroups(withDeps, "package_manager")
      : [
          {
            key: "load",
            label: "Projects",
            runIds: withDeps.map((s) => s.run_id),
          },
        ];
  return {
    x_title: "Star rank",
    y_title: "Vulnerability instances",
    labels: withDeps.map((s) => `#${s.rank + 1}`),
    series: groups.map(({ key, label, runIds }) => ({
      key,
      label,
      values: withDeps.map((s) =>
        runIds.includes(s.run_id) ? (loads.get(s.run_id) ?? 0) : null,
      ),
    })),
  };
}

const FIX_KIND_LABELS = {
  upgraded: "Upgraded",
  removed_direct: "Removed directly",
  removed_transitive: "Removed transitively",
} as const;

function upstreamLeverageFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const precision = definition.filters["dating_precision"];
  const range = dateRangeOf(definition);
  const headDay = gridDay(rows.head_cutoff);
  const block = upstreamLeverage(
    rows.runs,
    subsetVulnerabilities(rows, definition),
    figureExposures(rows, definition).filter(
      ({ fix }) => !precision || fix?.precision === precision,
    ),
  );

  if (definition.chart_form === "line") {
    const shown = block.packages_to_clear.filter((row) =>
      inRange(row.grid_date ?? headDay, range),
    );
    return {
      x_title: "Grid date",
      y_title: "Packages to clear",
      labels: shown.map((row) => row.grid_date ?? "HEAD"),
      series: [
        {
          key: "clear_50",
          label: "50% of instances",
          values: shown.map((row) => row.pkgs_clear_50),
        },
        {
          key: "clear_80",
          label: "80% of instances",
          values: shown.map((row) => row.pkgs_clear_80),
        },
      ],
    };
  }

  const shown = block.fix_kinds.filter((row) =>
    inRange(row.interval_to ?? headDay, range),
  );
  const labels = shown.map((row) => row.interval_to ?? "HEAD");
  const axes = { x_title: "Interval ending", y_title: "Fixes", labels };
  if (definition.group_by !== "fix_kind") {
    return {
      ...axes,
      series: [
        { key: "fixes", label: "Fixes", values: shown.map((row) => row.fixes) },
      ],
    };
  }
  return {
    ...axes,
    series: [
      ...FIX_KINDS.map((kind) => ({
        key: kind,
        label: FIX_KIND_LABELS[kind],
        values: shown.map((row) => row[kind]),
      })),
      {
        key: "unknown",
        label: "Unknown",
        values: shown.map((row) => row.unknown),
      },
    ],
  };
}

/** Every catalog metric needs a builder, or this does not compile. */
const FIGURE_BUILDERS: Record<
  FigureMetricId,
  (rows: FigureRows, definition: FigureDefinition) => FigureData
> = {
  load_over_time: loadOverTimeFigure,
  residence: residenceFigure,
  concentration: concentrationFigure,
  severity_mix: severityMixFigure,
  stars_vs_load: starsVsLoadFigure,
  upstream_leverage: upstreamLeverageFigure,
};

/** The data of a Figure whose definition the catalog has already accepted. */
export function computeFigureData(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  return FIGURE_BUILDERS[definition.metric](rows, definition);
}
