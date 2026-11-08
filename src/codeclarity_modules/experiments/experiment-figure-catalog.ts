/** The allowlist of Figures: what the composer offers and the API accepts. */
import { publishedDay } from "./experiment-grid";
import { InvalidFigureDefinition } from "./experiments.errors";

export interface FigureChoice {
  id: string;
  label: string;
}

export interface FigureFilter extends FigureChoice {
  /** A date range instead of a list of options */
  kind?: "date_range";
  options: readonly FigureChoice[];
}

export interface FigureChartForm extends FigureChoice {
  /** How the composer draws it; a line when not given */
  mark?: "line" | "bar" | "point";
  /** The metric's group-bys and filters valid with this form, all when not given */
  group_by?: readonly string[];
  filters?: readonly string[];
}

export interface FigureMetric extends FigureChoice {
  chart_forms: readonly FigureChartForm[];
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

const SWEEP_FILTER: FigureFilter = {
  id: "sweep",
  label: "Sweep subset",
  options: [
    { id: "match_correct_only", label: "Correct matches only" },
    { id: "non_withdrawn", label: "Not withdrawn" },
  ],
};

const DATING_PRECISION_FILTER: FigureFilter = {
  id: "dating_precision",
  label: "Dating precision",
  options: [
    { id: "commit", label: "Dated to a commit" },
    { id: "snapshot", label: "Dated to a snapshot interval" },
  ],
};

const DATE_RANGE_FILTER: FigureFilter = {
  id: "date_range",
  label: "Date range",
  kind: "date_range",
  options: [],
};

const PACKAGE_MANAGER_GROUP = {
  id: "package_manager",
  label: "Package manager",
};
const STAR_RANK_GROUP = { id: "star_rank_bucket", label: "Star-rank bucket" };
const FIX_KIND_GROUP = { id: "fix_kind", label: "Fix kind" };

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
      id: "residence",
      label: "Residence",
      chart_forms: [
        { id: "histogram", label: "Histogram", mark: "bar" },
        { id: "quartiles", label: "Quartiles", mark: "bar" },
      ],
      group_by: [BY_SEVERITY],
      filters: [SWEEP_FILTER, DATING_PRECISION_FILTER, DATE_RANGE_FILTER],
    },
    {
      id: "concentration",
      label: "Concentration (Lorenz curve)",
      chart_forms: [LINE],
      group_by: [],
      filters: [SWEEP_FILTER, VIEW_FILTER],
    },
    {
      id: "severity_mix",
      label: "Severity mix",
      chart_forms: [{ id: "bar", label: "Bar", mark: "bar" }],
      group_by: [PACKAGE_MANAGER_GROUP, STAR_RANK_GROUP],
      filters: [SWEEP_FILTER, VIEW_FILTER],
    },
    {
      id: "stars_vs_load",
      label: "Stars vs load",
      chart_forms: [{ id: "scatter", label: "Scatter", mark: "point" }],
      group_by: [PACKAGE_MANAGER_GROUP],
      filters: [SWEEP_FILTER, VIEW_FILTER],
    },
    {
      id: "upstream_leverage",
      label: "Upstream leverage",
      chart_forms: [
        {
          id: "line",
          label: "Packages to clear",
          group_by: [],
          filters: ["sweep", "date_range"],
        },
        { id: "bar", label: "Fixes per interval", mark: "bar" },
      ],
      group_by: [FIX_KIND_GROUP],
      filters: [SWEEP_FILTER, DATING_PRECISION_FILTER, DATE_RANGE_FILTER],
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
  const form = metric?.chart_forms.find(
    (candidate) => candidate.id === value["chart_form"],
  );
  if (!metric || !form) throw new InvalidFigureDefinition();

  const groupChoices = allowedFor(metric.group_by, form.group_by);
  const groupBy = value["group_by"] ?? null;
  if (groupBy !== null && !hasChoice(groupChoices, groupBy)) {
    throw new InvalidFigureDefinition();
  }

  const given = value["filters"] ?? {};
  if (!isRecord(given)) throw new InvalidFigureDefinition();
  const allowedFilters = allowedFor(metric.filters, form.filters);
  if (!Object.keys(given).every((id) => hasChoice(allowedFilters, id))) {
    throw new InvalidFigureDefinition();
  }
  const filters: Record<string, string> = {};
  for (const filter of allowedFilters) {
    if (!Object.hasOwn(given, filter.id)) continue;
    if (!isValidFilterValue(filter, given[filter.id])) {
      throw new InvalidFigureDefinition();
    }
    filters[filter.id] = given[filter.id] as string;
  }

  return {
    metric: metric.id as FigureMetricId,
    chart_form: form.id,
    group_by: groupBy as string | null,
    filters,
  };
}

function allowedFor<T extends FigureChoice>(
  choices: readonly T[],
  allowed: readonly string[] | undefined,
): readonly T[] {
  return allowed
    ? choices.filter((choice) => allowed.includes(choice.id))
    : choices;
}

function isValidFilterValue(filter: FigureFilter, value: unknown): boolean {
  if (filter.kind === "date_range") {
    return typeof value === "string" && parseDateRange(value) !== null;
  }
  return hasChoice(filter.options, value);
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Reads "YYYY-MM-DD/YYYY-MM-DD", either end optional; null when not a range. */
export function parseDateRange(value: string): DateRange | null {
  const [from, to, ...rest] = value.split("/");
  if (to === undefined || rest.length > 0 || (!from && !to)) return null;
  if (
    (from && publishedDay(from) !== from) ||
    (to && publishedDay(to) !== to)
  ) {
    return null;
  }
  if (from && to && from > to) return null;
  return { from: from || null, to: to || null };
}
