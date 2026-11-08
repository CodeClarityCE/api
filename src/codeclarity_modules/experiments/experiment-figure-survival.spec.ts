import { parseFigureDefinition } from "./experiment-figure-catalog";
import { computeFigureData, type FigureRows } from "./experiment-figure-data";
import {
  aggregateExperimentResults,
  type ResultsRunInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";
import { InvalidFigureDefinition } from "./experiments.errors";

const GRID = ["2025-01-01", "2025-02-01", "2025-03-01", null];
const COMMITS = ["2025-01-01", "2025-02-01", "2025-03-01", "2025-04-10"];
const HEAD = new Date("2025-04-15T09:00:00Z");

interface EntryOptions {
  severity?: string;
  published?: string | null;
  flag?: string;
}

/** One entry with one vulnerability, present (P) or absent (A) per snapshot. */
function entry(
  id: string,
  states: ("P" | "A")[],
  options: EntryOptions = {},
): { runs: ResultsRunInput[]; vulnerabilities: ResultsVulnerabilityInput[] } {
  const runs: ResultsRunInput[] = [];
  const vulnerabilities: ResultsVulnerabilityInput[] = [];
  states.forEach((state, i) => {
    const runId = `${id}-${i}`;
    runs.push({
      status: "done",
      error: null,
      dataset_entry_id: id,
      grid_index: i,
      grid_date: GRID[i] ? new Date(`${GRID[i]}T00:00:00Z`) : null,
      rows_run_id: runId,
      commit_hash: `${id}-c${i}`,
      committed_at: new Date(`${COMMITS[i]}T12:00:00Z`),
    });
    if (state === "P") {
      vulnerabilities.push({
        run_id: runId,
        vulnerability_id: "CVE-2025-0001",
        affected_dependency: "lodash",
        severity_class: options.severity ?? "MEDIUM",
        published_date:
          options.published === undefined ? "2024-12-01" : options.published,
        epss_score: null,
        conflict_flag: options.flag ?? "MATCH_CORRECT",
        winning_source: "OSV",
        withdrawn_date: null,
      });
    }
  });
  return { runs, vulnerabilities };
}

function rowsOf(entries: ReturnType<typeof entry>[]): FigureRows {
  return {
    runs: entries.flatMap((e) => e.runs),
    vulnerabilities: entries.flatMap((e) => e.vulnerabilities),
    head_cutoff: HEAD,
  };
}

// Exposed for 59, 31 and 99 days and fixed; one still open at 104 days.
const COHORT = [
  entry("fixed-march", ["P", "P", "A", "A"]),
  entry("fixed-february", ["P", "A", "A", "A"]),
  entry("fixed-head", ["P", "P", "P", "A"], { severity: "CRITICAL" }),
  entry("open", ["P", "P", "P", "P"]),
];

const SURVIVAL = {
  metric: "survival",
  chart_form: "step",
  group_by: null,
  filters: {},
} as const;

describe("computeFigureData for survival", () => {
  it("matches the survival block, including its band, without a filter", () => {
    const rows = rowsOf(COHORT);
    const data = computeFigureData(rows, SURVIVAL);
    const { curve } = aggregateExperimentResults({
      runs: [...rows.runs],
      summaries: [],
      vulnerabilities: [...rows.vulnerabilities],
      provenance: {
        api_version: null,
        analyzer_steps: null,
        knowledge_start: null,
        knowledge_end: null,
        created_by: null,
        created_on: HEAD,
        started_on: HEAD,
        ended_on: HEAD,
      },
    }).exposure_survival.overall;

    expect(data.labels).toEqual(["31", "59", "99", "104"]);
    const [series] = data.series;
    expect(series!.values).toEqual([0.75, 0.5, 0.25, 0.25]);
    expect(series!.values).toEqual(curve.map((step) => step.survival));
    expect(series!.lower).toEqual(curve.map((step) => step.lower));
    expect(series!.upper).toEqual(curve.map((step) => step.upper));
  });

  it("censors open exposures at HEAD", () => {
    const data = computeFigureData(rowsOf(COHORT), SURVIVAL);

    expect(data.censored_at).toBe("2025-04-15");
    expect(data.series[0]!.censored).toEqual([0, 0, 0, 1]);
  });

  it("draws one curve per severity on a shared time axis", () => {
    const data = computeFigureData(rowsOf(COHORT), {
      ...SURVIVAL,
      group_by: "severity",
    });

    expect(data.labels).toEqual(["31", "59", "99", "104"]);
    expect(data.series.map((s) => s.label)).toEqual(["Critical", "Medium"]);
    // Critical holds at 1 until its only fix, and ends with its last step
    expect(data.series[0]!.values).toEqual([1, 1, 0, null]);
    expect(data.series[1]!.values[0]).toBeCloseTo(2 / 3, 10);
    expect(data.series[1]!.values[1]).toBeCloseTo(1 / 3, 10);
    expect(data.series[1]!.values[2]).toBeCloseTo(1 / 3, 10);
    expect(data.series[1]!.values[3]).toBeCloseTo(1 / 3, 10);
    expect(data.series[1]!.censored).toEqual([0, 0, 0, 1]);
  });
});

const FIX_LAG = { ...SURVIVAL, metric: "fix_lag" } as const;

describe("computeFigureData for fix lag", () => {
  it("counts days from disclosure and censors open exposures at HEAD", () => {
    const data = computeFigureData(rowsOf(COHORT), FIX_LAG);

    // Disclosed 2024-12-01; fixed at 62, 90 and 130 days; open at 135
    expect(data.labels).toEqual(["62", "90", "130", "135"]);
    expect(data.series[0]!.values).toEqual([0.75, 0.5, 0.25, 0.25]);
    expect(data.series[0]!.censored).toEqual([0, 0, 0, 1]);
    expect(data.series[0]!.lower![0]).toBeLessThan(0.75);
    expect(data.series[0]!.upper![0]).toBeGreaterThan(0.75);
    expect(data.censored_at).toBe("2025-04-15");
  });

  it("keeps fixes made before disclosure as negative lags", () => {
    const data = computeFigureData(
      rowsOf([
        entry("early", ["P", "A", "A", "A"], { published: "2025-04-01" }),
      ]),
      FIX_LAG,
    );

    expect(data.labels).toEqual(["-59"]);
    expect(data.series[0]!.values).toEqual([0]);
  });

  it("leaves out exposures whose disclosure date is unknown", () => {
    const data = computeFigureData(
      rowsOf([
        ...COHORT,
        entry("undated", ["P", "P", "P", "P"], { published: null }),
      ]),
      FIX_LAG,
    );

    expect(data.series[0]!.censored).toEqual([0, 0, 0, 1]);
  });

  it("draws one curve per severity", () => {
    const data = computeFigureData(rowsOf(COHORT), {
      ...FIX_LAG,
      group_by: "severity",
    });

    expect(data.series.map((s) => s.key)).toEqual(["CRITICAL", "MEDIUM"]);
    expect(data.series[0]!.values).toEqual([1, 1, 0, null]);
  });
});

describe("the sweep subset filter on survival and fix lag", () => {
  const ROWS = rowsOf([
    entry("kept", ["P", "A", "A", "A"]),
    entry("mismatch", ["P", "P", "P", "P"], { flag: "MATCH_POSSIBLE" }),
  ]);

  it.each([SURVIVAL, FIX_LAG])(
    "drops instances outside the subset before deriving exposures",
    (definition) => {
      const data = computeFigureData(ROWS, {
        ...definition,
        filters: { sweep: "match_correct_only" },
      });

      expect(data.series[0]!.values).toEqual([0]);
      expect(data.series[0]!.censored).toEqual([0]);
    },
  );

  it("keeps every instance without the filter", () => {
    const data = computeFigureData(ROWS, SURVIVAL);

    expect(data.series[0]!.censored).toEqual([0, 1]);
  });
});

describe("the catalog rules for survival and fix lag", () => {
  it.each(["survival", "fix_lag"])("accepts a valid %s Figure", (metric) => {
    expect(
      parseFigureDefinition({
        metric,
        chart_form: "step",
        group_by: "severity",
        filters: { sweep: "non_withdrawn" },
      }),
    ).toEqual({
      metric,
      chart_form: "step",
      group_by: "severity",
      filters: { sweep: "non_withdrawn" },
    });
  });

  it.each([
    ["a form that ignores censoring", { chart_form: "line" }],
    ["fix kind, unknown for open exposures", { group_by: "fix_kind" }],
    ["the as-of view", { filters: { view: "as_of" } }],
    [
      "dating precision, known only for fixes",
      { filters: { precision: "commit" } },
    ],
    ["an unknown sweep subset", { filters: { sweep: "everything" } }],
  ])("rejects %s", (_, change) => {
    for (const metric of ["survival", "fix_lag"]) {
      expect(() =>
        parseFigureDefinition({
          metric,
          chart_form: "step",
          group_by: null,
          filters: {},
          ...change,
        }),
      ).toThrow(InvalidFigureDefinition);
    }
  });
});

describe("computeFigureData caption", () => {
  it("counts the exposures of a survival Figure", () => {
    expect(computeFigureData(rowsOf(COHORT), SURVIVAL).caption).toEqual({
      n: "n = 4 exposures, 3 fixed, 1 censored at 2025-04-15",
      exclusions: [],
    });
  });

  it("counts only what the sweep filter keeps and names what it drops", () => {
    const rows = rowsOf([
      ...COHORT,
      entry("wrong-match", ["P", "P", "P", "P"], { flag: "INCORRECT" }),
    ]);

    const { caption } = computeFigureData(rows, {
      ...SURVIVAL,
      filters: { sweep: "match_correct_only" },
    });

    expect(caption).toEqual({
      n: "n = 4 exposures, 3 fixed, 1 censored at 2025-04-15",
      exclusions: ["1 exposure outside Correct matches only"],
    });
  });

  it("leaves exposures with no disclosure date out of fix lag and says so", () => {
    const rows = rowsOf([
      ...COHORT,
      entry("undisclosed", ["P", "P", "P", "P"], { published: null }),
    ]);

    const { caption } = computeFigureData(rows, {
      ...SURVIVAL,
      metric: "fix_lag",
    });

    expect(caption).toEqual({
      n: "n = 4 exposures, 3 fixed, 1 censored at 2025-04-15",
      exclusions: ["1 exposure without a disclosure or fix date"],
    });
  });
});
