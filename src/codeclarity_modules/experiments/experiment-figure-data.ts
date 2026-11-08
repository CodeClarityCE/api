/** The plotted values of a Figure, computed from tidy rows. Pure. */
import {
  deriveExposures,
  type Exposure,
  type ExposuresInput,
  FIX_KINDS,
} from "./experiment-exposures";
import {
  type DateRange,
  DATING_PRECISION_FILTER,
  type FigureDefinition,
  type FigureFilter,
  type FigureMetricId,
  parseDateRange,
  SWEEP_FILTER,
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
import { SEVERITY_ORDER } from "./experiment-severity";
import { lorenzCurve, wilsonInterval } from "./experiment-stats";
import {
  exposureSurvival,
  fixLagSurvival,
  type SurvivalGroup,
} from "./experiment-survival";
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
  /** 95% band around values: survival, or a severity's share scaled to instances */
  lower?: (number | null)[];
  upper?: (number | null)[];
  /** Exposures censored at each point, on survival Figures */
  censored?: number[];
}

/** What a Figure's caption says about its sample, after its filters. */
export interface FigureCaptionFacts {
  n: string;
  exclusions: string[];
}

export interface FigureData {
  x_title: string;
  y_title: string;
  /** One per point along x */
  labels: string[];
  series: FigureSeries[];
  /** YYYY-MM-DD open exposures are censored at, on survival Figures */
  censored_at?: string;
  caption: FigureCaptionFacts;
}

const LOAD_VIEWS = [
  { key: "hindsight", label: "Hindsight" },
  { key: "as_of", label: "As-of" },
] as const satisfies readonly { key: keyof LoadRow; label: string }[];

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One exclusion phrase, or none when nothing was left out. */
function dropped(
  count: number,
  one: string,
  many: string,
  rest: string,
): string[] {
  return count > 0 ? [`${counted(count, one, many)} ${rest}`] : [];
}

function optionLabel(filter: FigureFilter, id: string | undefined): string {
  return filter.options.find((option) => option.id === id)?.label ?? `${id}`;
}

/** Projects behind each plotted grid date, and the dates with none done. */
function gridDateCaption(
  projects: readonly number[],
  exclusions: string[] = [],
): FigureCaptionFacts {
  const done = projects.filter((count) => count > 0);
  const low = Math.min(...done);
  const high = Math.max(...done, 0);
  const range =
    done.length === 0 || low === high ? `${high}` : `${low} to ${high}`;
  return {
    n: `n = ${range} ${high === 1 && low === high ? "project" : "projects"} with a done snapshot per grid date`,
    exclusions: [
      ...exclusions,
      ...dropped(
        projects.length - done.length,
        "grid date",
        "grid dates",
        "without a done snapshot",
      ),
    ],
  };
}

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
    caption: gridDateCaption(load.map((row) => row.projects)),
  };
}

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
  const subset = definition.filters["sweep"] as SweepSubset | undefined;
  return subset
    ? rows.vulnerabilities.filter(SWEEP_FILTERS[subset])
    : rows.vulnerabilities;
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
  const exposures = filteredExposures(rows, definition);
  const introduced = exposures.filter((e) => e.introduction !== null);
  const precise = introduced.filter(
    (e) => !precision || e.introduction!.precision === precision,
  );
  const kept = precise.filter((e) => inRange(e.introduction!.date, range));
  const block = residenceBlock(kept);
  const bySeverity = definition.group_by === "severity";
  const caption: FigureCaptionFacts = {
    n: `n = ${counted(block.overall.n, "introduction", "introductions")} on or before disclosure`,
    exclusions: [
      ...sweepExclusions(rows, definition, exposures.length),
      ...dropped(
        exposures.length - introduced.length,
        "exposure",
        "exposures",
        "present at the first snapshot",
      ),
      ...dropped(
        introduced.length - precise.length,
        "introduction",
        "introductions",
        `outside ${optionLabel(DATING_PRECISION_FILTER, precision)}`,
      ),
      ...dropped(
        precise.length - kept.length,
        "introduction",
        "introductions",
        "outside the date range",
      ),
      ...dropped(
        block.undated,
        "introduction",
        "introductions",
        "without a publication date",
      ),
      ...dropped(
        block.after_disclosure.n,
        "introduction",
        "introductions",
        "after disclosure",
      ),
    ],
  };

  if (definition.chart_form === "quartiles") {
    const groups = bySeverity
      ? block.by_severity.map((group) => ({
          key: group.key,
          label: severityLabel(group.key),
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
      caption,
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
        label: severityLabel(key),
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
    caption,
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

/** Instances of these runs that the sweep and view filters left out. */
function instanceExclusions(
  rows: FigureRows,
  definition: FigureDefinition,
  runIds: readonly string[],
): string[] {
  const inRuns = new Set(runIds);
  const count = (list: readonly ResultsVulnerabilityInput[]): number =>
    list.filter((v) => inRuns.has(v.run_id)).length;
  const subset = count(subsetVulnerabilities(rows, definition));
  return [
    ...dropped(
      count(rows.vulnerabilities) - subset,
      "instance",
      "instances",
      `outside ${optionLabel(SWEEP_FILTER, definition.filters["sweep"])}`,
    ),
    ...dropped(
      subset - count(viewedVulnerabilities(rows, definition)),
      "instance",
      "instances",
      "published after the HEAD cutoff",
    ),
  ];
}

/** Share of the population at each 5% step of a Lorenz curve. */
const LORENZ_STEPS = Array.from({ length: 21 }, (_, i) => i * 5);

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

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
    caption: {
      n: `n = ${counted(universe.length, "project", "projects")} at HEAD, ${counted(packageCounts.length, "package", "packages")}, ${counted(sum([...loadByRun.values()]), "vulnerability instance", "vulnerability instances")}`,
      exclusions: instanceExclusions(rows, definition, universe),
    },
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
  const summaries = headSummaries(rows.runs, rows.summaries);
  const groups = headGroups(summaries, definition.group_by);
  const series = groups.map(({ key, label, runIds }) => {
    const counts = measureHeadline(runIds, vulnerabilities).headline.sev_counts;
    const values = SEVERITY_ORDER.map((severity) => counts[severity]);
    const total = sum(values);
    const intervals = values.map((count) => wilsonInterval(count, total));
    return {
      key,
      label,
      values,
      lower: intervals.map((i) => (i ? i.low * total : null)),
      upper: intervals.map((i) => (i ? i.high * total : null)),
    };
  });
  return {
    x_title: "Severity",
    y_title: "Vulnerability instances",
    labels: SEVERITY_ORDER.map((severity) => severityLabel(severity)),
    series,
    caption: {
      n: `n = ${counted(sum(series.flatMap((s) => s.values)), "vulnerability instance", "vulnerability instances")} in ${counted(summaries.length, "project", "projects")} at HEAD`,
      exclusions: instanceExclusions(
        rows,
        definition,
        summaries.map((s) => s.run_id),
      ),
    },
  };
}

function starsVsLoadFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const summaries = headSummaries(rows.runs, rows.summaries);
  const withDeps = summaries
    .filter((s) => s.total_dependencies > 0)
    .sort((a, b) => a.rank - b.rank);
  const { sweep, view } = definition.filters;
  const filtered = sweep !== undefined || view === "as_of";
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
    caption: {
      n: `n = ${counted(withDeps.length, "project", "projects")} with dependencies at HEAD`,
      exclusions: [
        ...instanceExclusions(
          rows,
          definition,
          withDeps.map((s) => s.run_id),
        ),
        ...dropped(
          summaries.length - withDeps.length,
          "project",
          "projects",
          "without dependencies",
        ),
      ],
    },
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
  const exposures = filteredExposures(rows, definition);
  const block = upstreamLeverage(
    rows.runs,
    subsetVulnerabilities(rows, definition),
    exposures.filter(({ fix }) => !precision || fix?.precision === precision),
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
      caption: gridDateCaption(
        shown.map((row) => row.projects),
        [
          ...instanceExclusions(
            rows,
            definition,
            rows.runs.flatMap((run) => run.rows_run_id ?? []),
          ),
          ...dropped(
            block.packages_to_clear.length - shown.length,
            "grid date",
            "grid dates",
            "outside the date range",
          ),
        ],
      ),
    };
  }

  const shown = block.fix_kinds.filter((row) =>
    inRange(row.interval_to ?? headDay, range),
  );
  const labels = shown.map((row) => row.interval_to ?? "HEAD");
  const shownFixes = sum(shown.map((row) => row.fixes));
  const caption: FigureCaptionFacts = {
    n: `n = ${counted(shownFixes, "fix", "fixes")} in ${counted(shown.length, "interval", "intervals")}`,
    exclusions: [
      ...sweepExclusions(rows, definition, exposures.length),
      ...dropped(
        exposures.filter(
          ({ fix }) => precision && fix && fix.precision !== precision,
        ).length,
        "fix",
        "fixes",
        `outside ${optionLabel(DATING_PRECISION_FILTER, precision)}`,
      ),
      ...dropped(
        sum(block.fix_kinds.map((row) => row.fixes)) - shownFixes,
        "fix",
        "fixes",
        "outside the date range",
      ),
    ],
  };
  const axes = {
    x_title: "Interval ending",
    y_title: "Fixes",
    labels,
    caption,
  };
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

/** Lines stepping through every group's times; each ends at its last step. */
function stepSeries(
  groups: readonly { label: string; group: SurvivalGroup }[],
): Pick<FigureData, "labels" | "series"> {
  const times = [
    ...new Set(groups.flatMap(({ group }) => group.curve.map((s) => s.time))),
  ].sort((a, b) => a - b);
  const series = groups.map(({ label, group: { key, curve } }) => {
    const points = times.map((time) => {
      const step = curve.findLast((s) => s.time <= time);
      const ended = time > (curve.at(-1)?.time ?? -Infinity);
      return {
        value: ended ? null : (step?.survival ?? 1),
        lower: ended ? null : (step?.lower ?? 1),
        upper: ended ? null : (step?.upper ?? 1),
        censored: step?.time === time ? step.censored : 0,
      };
    });
    return {
      key,
      label,
      values: points.map((p) => p.value),
      lower: points.map((p) => p.lower),
      upper: points.map((p) => p.upper),
      censored: points.map((p) => p.censored),
    };
  });
  return { labels: times.map(String), series };
}

/** "CRITICAL" as "Critical". */
function severityLabel(severity: string): string {
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

/** The curves a definition asks for: one per severity, or all exposures. */
function survivalGroups(
  block: { overall: SurvivalGroup; by_severity: SurvivalGroup[] },
  definition: FigureDefinition,
): { label: string; group: SurvivalGroup }[] {
  if (definition.group_by === "severity") {
    return block.by_severity.map((group) => ({
      label: severityLabel(group.key),
      group,
    }));
  }
  return [{ label: "All exposures", group: block.overall }];
}

/** Exposures of the instances the sweep filter keeps, all when not applied. */
function filteredExposures(
  rows: FigureRows,
  definition: FigureDefinition,
): Exposure[] {
  return deriveExposures({
    ...rows,
    vulnerabilities: subsetVulnerabilities(rows, definition),
  });
}

/** Names the chosen sweep subset and what it left out of the Figure. */
function sweepExclusions(
  rows: FigureRows,
  definition: FigureDefinition,
  kept: number,
): string[] {
  const subset = definition.filters["sweep"];
  if (!subset) return [];
  return dropped(
    deriveExposures(rows).length - kept,
    "exposure",
    "exposures",
    `outside ${optionLabel(SWEEP_FILTER, subset)}`,
  );
}

/** The sample of a step Figure; `dropped` are exposures it could not plot. */
function stepCaption(
  { overall, censored_at }: { overall: SurvivalGroup; censored_at: string },
  sweep: string[],
  dropped: string[],
): FigureCaptionFacts {
  return {
    n: `n = ${overall.n} exposures, ${overall.fixed} fixed, ${overall.censored} censored at ${censored_at}`,
    exclusions: [...sweep, ...dropped],
  };
}

function survivalFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const exposures = filteredExposures(rows, definition);
  const block = exposureSurvival(exposures, rows.head_cutoff);
  return {
    x_title: "Days exposed",
    y_title: "Share still exposed",
    ...stepSeries(survivalGroups(block, definition)),
    censored_at: block.censored_at,
    caption: stepCaption(
      block,
      sweepExclusions(rows, definition, exposures.length),
      [],
    ),
  };
}

function fixLagFigure(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  const exposures = filteredExposures(rows, definition);
  const block = fixLagSurvival(exposures, rows.head_cutoff);
  return {
    x_title: "Days since disclosure",
    y_title: "Share not yet fixed",
    ...stepSeries(survivalGroups(block, definition)),
    censored_at: block.censored_at,
    caption: stepCaption(
      block,
      sweepExclusions(rows, definition, exposures.length),
      dropped(
        exposures.length - block.overall.n,
        "exposure",
        "exposures",
        "without a disclosure or fix date",
      ),
    ),
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
  survival: survivalFigure,
  fix_lag: fixLagFigure,
};

/** The data of a Figure whose definition the catalog has already accepted. */
export function computeFigureData(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  return FIGURE_BUILDERS[definition.metric](rows, definition);
}
