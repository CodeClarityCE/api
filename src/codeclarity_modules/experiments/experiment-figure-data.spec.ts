import { computeFigureData } from "./experiment-figure-data";
import type {
  ResultsRunInput,
  ResultsVulnerabilityInput,
} from "./experiment-results";

function run(id: string, gridDate: string | null): ResultsRunInput {
  return {
    status: "done",
    error: null,
    grid_date: gridDate ? new Date(`${gridDate}T00:00:00Z`) : null,
    rows_run_id: id,
  };
}

function instance(runId: string, published: string): ResultsVulnerabilityInput {
  return {
    run_id: runId,
    affected_dependency: "lodash",
    vulnerability_id: "GHSA-mid",
    severity_class: "HIGH",
    epss_score: null,
    conflict_flag: "MATCH_CORRECT",
    winning_source: "OSV",
    withdrawn_date: null,
    published_date: published,
  };
}

const ROWS = {
  runs: [run("a1", "2025-01-01"), run("a2", "2025-03-01"), run("aH", null)],
  vulnerabilities: [
    instance("a1", "2025-02-15T10:00:00Z"),
    instance("a2", "2025-02-15T10:00:00Z"),
    instance("aH", "2025-02-15T10:00:00Z"),
  ],
  head_cutoff: new Date("2026-01-01T00:00:00Z"),
};

describe("computeFigureData for load over time", () => {
  it("draws both views per grid date, HEAD last, without a filter", () => {
    const data = computeFigureData(ROWS, {
      metric: "load_over_time",
      chart_form: "line",
      group_by: null,
      filters: {},
    });

    expect(data.labels).toEqual(["2025-01-01", "2025-03-01", "HEAD"]);
    expect(data.series).toEqual([
      { key: "hindsight", label: "Hindsight", values: [1, 1, 1] },
      { key: "as_of", label: "As-of", values: [0, 1, 1] },
    ]);
  });

  it("draws only the chosen view when filtered", () => {
    const data = computeFigureData(ROWS, {
      metric: "load_over_time",
      chart_form: "line",
      group_by: null,
      filters: { view: "as_of" },
    });

    expect(data.series).toEqual([
      { key: "as_of", label: "As-of", values: [0, 1, 1] },
    ]);
  });

  it("leaves a gap at a grid date without a done snapshot", () => {
    const data = computeFigureData(
      {
        ...ROWS,
        runs: [
          { ...run("a1", "2025-01-01"), status: "failed" },
          run("aH", null),
        ],
      },
      {
        metric: "load_over_time",
        chart_form: "line",
        group_by: null,
        filters: { view: "hindsight" },
      },
    );

    expect(data.series[0]!.values).toEqual([null, 1]);
  });

  it("gives the same data for the same definition", () => {
    const definition = {
      metric: "load_over_time",
      chart_form: "line",
      group_by: null,
      filters: {},
    } as const;

    expect(computeFigureData(ROWS, definition)).toEqual(
      computeFigureData(ROWS, definition),
    );
  });
});
