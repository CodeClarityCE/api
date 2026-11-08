/** The plotted values of a Figure, computed from tidy rows. Pure. */
import type {
  FigureDefinition,
  FigureMetricId,
} from "./experiment-figure-catalog";
import { loadOverTime, type LoadRow } from "./experiment-load";
import type {
  ResultsRunInput,
  ResultsVulnerabilityInput,
} from "./experiment-results";

export interface FigureRows {
  runs: readonly ResultsRunInput[];
  vulnerabilities: readonly ResultsVulnerabilityInput[];
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

/** Every catalog metric needs a builder, or this does not compile. */
const FIGURE_BUILDERS: Record<
  FigureMetricId,
  (rows: FigureRows, definition: FigureDefinition) => FigureData
> = {
  load_over_time: loadOverTimeFigure,
};

/** The data of a Figure whose definition the catalog has already accepted. */
export function computeFigureData(
  rows: FigureRows,
  definition: FigureDefinition,
): FigureData {
  return FIGURE_BUILDERS[definition.metric](rows, definition);
}
