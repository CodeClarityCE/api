/** The plotted values of a Figure, computed from tidy rows. Pure. */
import {
  deriveExposures,
  type Exposure,
  type ExposuresInput,
} from "./experiment-exposures";
import {
  type FigureDefinition,
  type FigureMetricId,
  SWEEP_FILTER,
} from "./experiment-figure-catalog";
import { loadOverTime, type LoadRow } from "./experiment-load";
import { SWEEP_FILTERS, type SweepSubset } from "./experiment-results";
import {
  exposureSurvival,
  fixLagSurvival,
  type SurvivalGroup,
} from "./experiment-survival";

export interface FigureRows extends ExposuresInput {
  /** HEAD's as-of cutoff, from headCutoff */
  head_cutoff: Date;
}

/** One line of a Figure; a null value leaves a gap. */
export interface FigureSeries {
  key: string;
  label: string;
  values: (number | null)[];
  /** 95% band around values, on survival Figures */
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
  caption?: FigureCaptionFacts;
}

const LOAD_VIEWS = [
  { key: "hindsight", label: "Hindsight" },
  { key: "as_of", label: "As-of" },
] as const satisfies readonly { key: keyof LoadRow; label: string }[];

/** Projects behind the load lines, and the grid dates with none done. */
function loadCaption(load: readonly LoadRow[]): FigureCaptionFacts {
  const counts = load
    .filter((r) => r.hindsight !== null)
    .map((r) => r.projects);
  const low = Math.min(...counts);
  const high = Math.max(...counts, 0);
  const range =
    counts.length === 0 || low === high ? `${high}` : `${low} to ${high}`;
  const empty = load.length - counts.length;
  return {
    n: `n = ${range} projects with a done snapshot per grid date`,
    exclusions:
      empty > 0
        ? [
            `${empty} grid ${empty === 1 ? "date" : "dates"} without a done snapshot`,
          ]
        : [],
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
    caption: loadCaption(load),
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
  const subset = definition.filters["sweep"] as SweepSubset | undefined;
  return deriveExposures(
    subset
      ? {
          ...rows,
          vulnerabilities: rows.vulnerabilities.filter(SWEEP_FILTERS[subset]),
        }
      : rows,
  );
}

function exposuresPhrase(count: number, rest: string): string[] {
  if (count <= 0) return [];
  return [`${count} ${count === 1 ? "exposure" : "exposures"} ${rest}`];
}

/** Names the chosen sweep subset and what it left out of the Figure. */
function sweepExclusions(
  rows: FigureRows,
  definition: FigureDefinition,
  kept: number,
): string[] {
  const subset = definition.filters["sweep"];
  if (!subset) return [];
  const label = SWEEP_FILTER.options.find(({ id }) => id === subset)?.label;
  return exposuresPhrase(
    deriveExposures(rows).length - kept,
    `outside ${label ?? subset}`,
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
      exposuresPhrase(
        exposures.length - block.overall.n,
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
