/** The allowlist of Figures: what the composer offers and the API accepts. */
import { InvalidFigureDefinition } from "./experiments.errors";

export interface FigureChoice {
  id: string;
  label: string;
}

export interface FigureFilter extends FigureChoice {
  options: readonly FigureChoice[];
}

export interface FigureMetric extends FigureChoice {
  chart_forms: readonly FigureChoice[];
  group_by: readonly FigureChoice[];
  filters: readonly FigureFilter[];
}

export interface FigureCatalog {
  metrics: readonly FigureMetric[];
}

const LINE = { id: "line", label: "Line" };

const VIEW_FILTER: FigureFilter = {
  id: "view",
  label: "View",
  options: [
    { id: "hindsight", label: "Hindsight" },
    { id: "as_of", label: "As-of" },
  ],
};

const STEP = { id: "step", label: "Step" };
const BY_SEVERITY = { id: "severity", label: "Severity" };

export const SWEEP_FILTER: FigureFilter = {
  id: "sweep",
  label: "Sweep subset",
  options: [
    { id: "match_correct_only", label: "Correct matches only" },
    { id: "non_withdrawn", label: "Not withdrawn" },
  ],
};

/** Add a metric here, then its builder in experiment-figure-data.ts. */
export const FIGURE_CATALOG = {
  metrics: [
    {
      id: "load_over_time",
      label: "Load over time",
      chart_forms: [LINE],
      group_by: [],
      filters: [VIEW_FILTER],
    },
    {
      id: "survival",
      label: "Survival",
      chart_forms: [STEP],
      group_by: [BY_SEVERITY],
      filters: [SWEEP_FILTER],
    },
    {
      id: "fix_lag",
      label: "Fix lag",
      chart_forms: [STEP],
      group_by: [BY_SEVERITY],
      filters: [SWEEP_FILTER],
    },
  ],
} as const satisfies FigureCatalog;

export type FigureMetricId = (typeof FIGURE_CATALOG.metrics)[number]["id"];

/** What one Figure shows; only combinations in the catalog are valid. */
export interface FigureDefinition {
  metric: FigureMetricId;
  chart_form: string;
  group_by: string | null;
  /** Filter id to chosen option id; a filter left out is not applied */
  filters: Record<string, string>;
}

const DEFINITION_KEYS = new Set([
  "metric",
  "chart_form",
  "group_by",
  "filters",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasChoice(choices: readonly FigureChoice[], id: unknown): boolean {
  return choices.some((choice) => choice.id === id);
}

/**
 * The definition in its canonical form, filters in catalog order.
 * @throws {InvalidFigureDefinition} If the catalog does not allow it
 */
export function parseFigureDefinition(value: unknown): FigureDefinition {
  if (!isRecord(value)) throw new InvalidFigureDefinition();
  if (Object.keys(value).some((key) => !DEFINITION_KEYS.has(key))) {
    throw new InvalidFigureDefinition();
  }

  const metrics: readonly FigureMetric[] = FIGURE_CATALOG.metrics;
  const metric = metrics.find((candidate) => candidate.id === value["metric"]);
  if (!metric || !hasChoice(metric.chart_forms, value["chart_form"])) {
    throw new InvalidFigureDefinition();
  }

  const groupBy = value["group_by"] ?? null;
  if (groupBy !== null && !hasChoice(metric.group_by, groupBy)) {
    throw new InvalidFigureDefinition();
  }

  const given = value["filters"] ?? {};
  if (!isRecord(given)) throw new InvalidFigureDefinition();
  if (!Object.keys(given).every((id) => hasChoice(metric.filters, id))) {
    throw new InvalidFigureDefinition();
  }
  const filters: Record<string, string> = {};
  for (const filter of metric.filters) {
    if (!Object.hasOwn(given, filter.id)) continue;
    if (!hasChoice(filter.options, given[filter.id])) {
      throw new InvalidFigureDefinition();
    }
    filters[filter.id] = given[filter.id] as string;
  }

  return {
    metric: metric.id as FigureMetricId,
    chart_form: value["chart_form"] as string,
    group_by: groupBy as string | null,
    filters,
  };
}
