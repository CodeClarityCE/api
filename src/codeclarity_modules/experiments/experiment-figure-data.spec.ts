import type { FigureMetricId } from "./experiment-figure-catalog";
import { computeFigureData, type FigureRows } from "./experiment-figure-data";
import {
  aggregateExperimentResults,
  type ResultsRunInput,
  type ResultsSummaryInput,
  type ResultsVulnerabilityInput,
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

const ROWS: FigureRows = {
  summaries: [],
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

  it("captions the projects behind each grid date and the empty ones", () => {
    const data = computeFigureData(
      {
        ...ROWS,
        runs: [
          { ...run("a1", "2025-01-01"), status: "failed" },
          run("a2", "2025-03-01"),
          run("aH", null),
          run("bH", null),
        ],
      },
      {
        metric: "load_over_time",
        chart_form: "line",
        group_by: null,
        filters: {},
      },
    );

    expect(data.caption).toEqual({
      n: "n = 1 to 2 projects with a done snapshot per grid date",
      exclusions: ["1 grid date without a done snapshot"],
    });
  });
});

const GRID = ["2025-01-01", "2025-03-01", null];

/** An entry over the grid: each snapshot's commit date and vulnerable package. */
function entry(
  id: string,
  severity: string,
  published: string,
  snapshots: [committed: string, present: boolean][],
): Pick<FigureRows, "runs" | "vulnerabilities"> {
  const runs: ResultsRunInput[] = [];
  const vulnerabilities: ResultsVulnerabilityInput[] = [];
  snapshots.forEach(([committed, present], gridIndex) => {
    const runId = `${id}-${gridIndex}`;
    const gridDate = GRID[gridIndex];
    runs.push({
      status: "done",
      error: null,
      dataset_entry_id: id,
      grid_index: gridIndex,
      grid_date: gridDate ? new Date(`${gridDate}T00:00:00Z`) : null,
      rows_run_id: runId,
      commit_hash: `${id}-c${gridIndex}`,
      committed_at: new Date(`${committed}T12:00:00Z`),
    });
    if (present) {
      vulnerabilities.push({
        ...instance(runId, published),
        vulnerability_id: `DEMO-${id}`,
        severity_class: severity,
      });
    }
  });
  return { runs, vulnerabilities };
}

function rowsOf(
  entries: Pick<FigureRows, "runs" | "vulnerabilities">[],
  summaries: ResultsSummaryInput[] = [],
): FigureRows {
  return {
    runs: entries.flatMap((e) => e.runs),
    vulnerabilities: entries.flatMap((e) => e.vulnerabilities),
    summaries,
    head_cutoff: new Date("2026-01-01T00:00:00Z"),
  };
}

function resultsOf(
  rows: FigureRows,
): ReturnType<typeof aggregateExperimentResults> {
  return aggregateExperimentResults({
    runs: [...rows.runs],
    vulnerabilities: [...rows.vulnerabilities],
    summaries: [...rows.summaries],
    read_at: rows.head_cutoff,
    provenance: {
      api_version: null,
      analyzer_steps: null,
      knowledge_start: null,
      knowledge_end: null,
      created_by: null,
      created_on: new Date("2025-07-10T00:00:00Z"),
      started_on: null,
      ended_on: null,
    },
  });
}

describe("computeFigureData for residence", () => {
  // Introduced 2025-02-21 and published 88 days later
  const CRITICAL = entry("e1", "CRITICAL", "2025-05-20", [
    ["2024-12-01", false],
    ["2025-02-21", true],
    ["2025-06-01", true],
  ]);
  // Introduced on the day of publication: residence 0
  const HIGH = entry("e2", "HIGH", "2025-02-20", [
    ["2024-12-01", false],
    ["2025-02-20", true],
    ["2025-06-01", true],
  ]);
  const ROWS_RESIDENCE = rowsOf([CRITICAL, HIGH]);

  it("draws the quartiles the results report, without a filter", () => {
    const data = computeFigureData(ROWS_RESIDENCE, {
      metric: "residence",
      chart_form: "quartiles",
      group_by: null,
      filters: {},
    });

    const { overall } = resultsOf(ROWS_RESIDENCE).residence;
    expect(data.labels).toEqual(["Min", "P25", "Median", "P75", "Max"]);
    expect(data.series[0]!.values).toEqual([
      overall.min,
      overall.p25,
      overall.median,
      overall.p75,
      overall.max,
    ]);
    expect(data.series[0]!.values).toEqual([0, 22, 44, 66, 88]);
  });

  it("counts residences per day bucket, one series per severity", () => {
    const data = computeFigureData(ROWS_RESIDENCE, {
      metric: "residence",
      chart_form: "histogram",
      group_by: "severity",
      filters: {},
    });

    expect(data.labels).toEqual([
      "0-30",
      "31-90",
      "91-180",
      "181-365",
      "366-730",
      "731+",
    ]);
    expect(data.series).toEqual([
      { key: "CRITICAL", label: "Critical", values: [0, 1, 0, 0, 0, 0] },
      { key: "HIGH", label: "High", values: [1, 0, 0, 0, 0, 0] },
    ]);
  });

  it("keeps introductions dated inside the date range", () => {
    const data = computeFigureData(ROWS_RESIDENCE, {
      metric: "residence",
      chart_form: "histogram",
      group_by: null,
      filters: { date_range: "2025-02-21/2025-12-31" },
    });

    expect(data.series[0]!.values).toEqual([0, 1, 0, 0, 0, 0]);
  });

  it("keeps only the chosen dating precision", () => {
    const data = computeFigureData(ROWS_RESIDENCE, {
      metric: "residence",
      chart_form: "histogram",
      group_by: null,
      filters: { dating_precision: "commit" },
    });

    expect(data.series[0]!.values).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

function headRun(id: string, rowsRunId = id): ResultsRunInput {
  return { ...run(id, null), rows_run_id: rowsRunId };
}

function summary(
  runId: string,
  rank: number,
  load: number,
  packageManager: string | null = "npm",
): ResultsSummaryInput {
  return {
    run_id: runId,
    rank,
    total_dependencies: 10,
    total_vulnerabilities: load,
    package_manager: packageManager,
  };
}

function hit(
  runId: string,
  pkg: string,
  fields: Partial<ResultsVulnerabilityInput> = {},
): ResultsVulnerabilityInput {
  return {
    ...instance(runId, "2024-01-01"),
    affected_dependency: pkg,
    ...fields,
  };
}

/** Four HEAD projects with loads 0, 2, 2 and 4 over packages a to d. */
const COHORT: FigureRows = {
  runs: ["r1", "r2", "r3", "r4"].map((id) => headRun(id)),
  summaries: [
    summary("r1", 0, 0),
    summary("r2", 1, 2),
    summary("r3", 2, 2),
    summary("r4", 3, 4),
  ],
  vulnerabilities: [
    hit("r2", "a"),
    hit("r2", "b"),
    hit("r3", "c"),
    hit("r3", "c"),
    ...Array.from({ length: 4 }, () => hit("r4", "d")),
  ],
  head_cutoff: new Date("2026-01-01T00:00:00Z"),
};

describe("computeFigureData for concentration", () => {
  const definition = {
    metric: "concentration",
    chart_form: "line",
    group_by: null,
    filters: {},
  } as const;

  /** Series values at the quarters of the population, by hand. */
  function quarters(
    data: {
      labels: string[];
      series: { key: string; values: (number | null)[] }[];
    },
    key: string,
  ): (number | null)[] {
    const series = data.series.find((s) => s.key === key)!;
    return ["0%", "25%", "50%", "75%", "100%"].map(
      (label) => series.values[data.labels.indexOf(label)]!,
    );
  }

  it("draws the Lorenz curves of projects and packages", () => {
    const data = computeFigureData(COHORT, definition);

    expect(quarters(data, "projects")).toEqual([0, 0, 25, 50, 100]);
    expect(quarters(data, "packages")).toEqual([0, 12.5, 25, 50, 100]);
  });

  it("encloses the Gini coefficient the results report", () => {
    const data = computeFigureData(COHORT, definition);
    const { headline } = resultsOf(COHORT);

    const giniOf = (key: string): number => {
      const y = quarters(data, key) as number[];
      const area = y
        .slice(1)
        .reduce((sum, value, i) => sum + (value + y[i]!) / 2 / 4 / 100, 0);
      return 1 - 2 * area;
    };

    expect(giniOf("projects")).toBeCloseTo(headline.gini_proj!, 10);
    expect(giniOf("packages")).toBeCloseTo(headline.gini_pkg!, 10);
  });

  it("drops instances the sweep subset leaves out", () => {
    const rows = {
      ...COHORT,
      vulnerabilities: COHORT.vulnerabilities.map((v) =>
        v.affected_dependency === "d"
          ? { ...v, withdrawn_date: "2025-01-01" }
          : v,
      ),
    };

    const data = computeFigureData(rows, {
      ...definition,
      filters: { sweep: "non_withdrawn" },
    });

    expect(quarters(data, "projects")).toEqual([0, 0, 0, 50, 100]);
  });

  it("counts projects sharing a commit's rows once", () => {
    const rows: FigureRows = {
      runs: [run("g1", "2025-01-01"), headRun("hH", "g1")],
      summaries: [summary("g1", 0, 2)],
      vulnerabilities: [hit("g1", "a"), hit("g1", "a")],
      head_cutoff: COHORT.head_cutoff,
    };

    const data = computeFigureData(rows, definition);

    expect(quarters(data, "projects")).toEqual([0, 25, 50, 75, 100]);
    expect(resultsOf(rows).headline.n_projects).toBe(1);
  });
});

describe("computeFigureData for severity mix", () => {
  const definition = {
    metric: "severity_mix",
    chart_form: "bar",
    group_by: null,
    filters: {},
  } as const;
  const rows: FigureRows = {
    runs: [headRun("p1"), headRun("p2"), run("g1", "2025-01-01")],
    summaries: [
      summary("p1", 0, 2, "npm"),
      summary("p2", 500, 1, "yarn"),
      summary("g1", 0, 9),
    ],
    vulnerabilities: [
      hit("p1", "a", { severity_class: "HIGH" }),
      hit("p1", "b", {
        severity_class: "LOW",
        published_date: "2026-06-01",
      }),
      hit("p2", "c", { severity_class: "HIGH" }),
      // A grid-only snapshot, outside HEAD
      hit("g1", "z", { severity_class: "CRITICAL" }),
    ],
    head_cutoff: COHORT.head_cutoff,
  };

  it("counts instances per severity, matching the results", () => {
    const data = computeFigureData(rows, definition);

    expect(data.labels).toEqual(["Critical", "High", "Medium", "Low", "None"]);
    expect(data.series[0]!.values).toEqual([0, 2, 0, 1, 0]);
    const counts = resultsOf(rows).headline.sev_counts;
    expect(data.series[0]!.values).toEqual([
      counts.CRITICAL,
      counts.HIGH,
      counts.MEDIUM,
      counts.LOW,
      counts.NONE,
    ]);
  });

  it("carries a 95% Wilson interval of each severity's share, in instances", () => {
    const [series] = computeFigureData(rows, definition).series;

    // High is 2 of 3 instances, critical 0 of 3
    expect(series!.lower![1]).toBeCloseTo(0.2077 * 3, 2);
    expect(series!.upper![1]).toBeCloseTo(0.9385 * 3, 2);
    expect(series!.lower![0]).toBe(0);
    expect(series!.upper![0]).toBeCloseTo(0.5615 * 3, 2);
  });

  it("leaves a group without instances without intervals", () => {
    const empty: FigureRows = { ...rows, vulnerabilities: [] };
    const [series] = computeFigureData(empty, definition).series;

    expect(series!.lower).toEqual([null, null, null, null, null]);
    expect(series!.upper).toEqual([null, null, null, null, null]);
  });

  it("groups by package manager and star-rank bucket", () => {
    expect(
      computeFigureData(rows, { ...definition, group_by: "package_manager" })
        .series,
    ).toEqual([
      expect.objectContaining({ key: "npm", values: [0, 1, 0, 1, 0] }),
      expect.objectContaining({ key: "yarn", values: [0, 1, 0, 0, 0] }),
    ]);
    expect(
      computeFigureData(rows, { ...definition, group_by: "star_rank_bucket" })
        .series,
    ).toEqual([
      expect.objectContaining({ key: "top_10", values: [0, 1, 0, 1, 0] }),
      expect.objectContaining({ key: "101_1000", values: [0, 1, 0, 0, 0] }),
    ]);
  });

  it("leaves advisories out of the as-of view until published", () => {
    const data = computeFigureData(rows, {
      ...definition,
      filters: { view: "as_of" },
    });

    expect(data.series[0]!.values).toEqual([0, 2, 0, 0, 0]);
  });
});

describe("computeFigureData for stars vs load", () => {
  const definition = {
    metric: "stars_vs_load",
    chart_form: "scatter",
    group_by: null,
    filters: {},
  } as const;

  it("plots each project with dependencies once, by star rank", () => {
    const rows: FigureRows = {
      runs: [headRun("p1"), headRun("p2"), headRun("p3")],
      summaries: [
        summary("p2", 1, 7, "yarn"),
        summary("p1", 0, 3),
        { ...summary("p3", 2, 0), total_dependencies: 0 },
      ],
      vulnerabilities: [],
      head_cutoff: COHORT.head_cutoff,
    };

    const data = computeFigureData(rows, definition);

    expect(data.labels).toEqual(["#1", "#2"]);
    expect(data.series).toEqual([
      { key: "load", label: "Projects", values: [3, 7] },
    ]);
    expect(resultsOf(rows).rqc.n).toBe(2);
  });

  it("splits projects into package manager series, with gaps", () => {
    const rows: FigureRows = {
      runs: [headRun("p1"), headRun("p2")],
      summaries: [summary("p1", 0, 3), summary("p2", 1, 7, "yarn")],
      vulnerabilities: [],
      head_cutoff: COHORT.head_cutoff,
    };

    const data = computeFigureData(rows, {
      ...definition,
      group_by: "package_manager",
    });

    expect(data.series).toEqual([
      { key: "npm", label: "npm", values: [3, null] },
      { key: "yarn", label: "yarn", values: [null, 7] },
    ]);
  });

  it("counts instances of the sweep subset when filtered", () => {
    const data = computeFigureData(
      {
        ...COHORT,
        vulnerabilities: COHORT.vulnerabilities.map((v) =>
          v.affected_dependency === "d"
            ? { ...v, conflict_flag: "MATCH_INCORRECT" }
            : v,
        ),
      },
      { ...definition, filters: { sweep: "match_correct_only" } },
    );

    expect(data.series[0]!.values).toEqual([0, 2, 2, 0]);
  });
});

describe("computeFigureData for upstream leverage", () => {
  // Present on the first two snapshots, gone at HEAD
  const FIXED = entry("e1", "HIGH", "2024-06-01", [
    ["2024-12-01", true],
    ["2025-02-01", true],
    ["2025-06-01", false],
  ]);
  const rows = rowsOf([FIXED]);

  it("draws packages to clear per grid date, matching the results", () => {
    const data = computeFigureData(rows, {
      metric: "upstream_leverage",
      chart_form: "line",
      group_by: null,
      filters: {},
    });

    const clear = resultsOf(rows).upstream_leverage.packages_to_clear;
    expect(data.labels).toEqual(["2025-01-01", "2025-03-01", "HEAD"]);
    expect(data.series).toEqual([
      {
        key: "clear_50",
        label: "50% of instances",
        values: clear.map((c) => c.pkgs_clear_50),
      },
      {
        key: "clear_80",
        label: "80% of instances",
        values: clear.map((c) => c.pkgs_clear_80),
      },
    ]);
    expect(data.series[0]!.values).toEqual([1, 1, 0]);
  });

  it("counts fixes per interval, split by fix kind", () => {
    const definition = {
      metric: "upstream_leverage",
      chart_form: "bar",
      group_by: "fix_kind",
      filters: {},
    } as const;

    const data = computeFigureData(rows, definition);

    expect(data.labels).toEqual(["2025-03-01", "HEAD"]);
    expect(data.series.map((s) => s.key)).toEqual([
      "upgraded",
      "removed_direct",
      "removed_transitive",
      "unknown",
    ]);
    expect(data.series.find((s) => s.key === "unknown")!.values).toEqual([
      0, 1,
    ]);
  });

  it("keeps fixes of the chosen dating precision", () => {
    const data = computeFigureData(rows, {
      metric: "upstream_leverage",
      chart_form: "bar",
      group_by: null,
      filters: { dating_precision: "commit" },
    });

    expect(data.series).toEqual([
      { key: "fixes", label: "Fixes", values: [0, 0] },
    ]);
  });

  it("keeps grid dates inside the date range, HEAD at its cutoff", () => {
    const data = computeFigureData(rows, {
      metric: "upstream_leverage",
      chart_form: "line",
      group_by: null,
      filters: { date_range: "2025-02-01/2025-12-31" },
    });

    expect(data.labels).toEqual(["2025-03-01"]);
  });
});

describe("computeFigureData captions after filters", () => {
  const FILTERED: FigureRows = {
    ...COHORT,
    vulnerabilities: [
      ...COHORT.vulnerabilities,
      hit("r4", "e", { conflict_flag: "INCORRECT" }),
      hit("r2", "f", { published_date: "2026-06-01" }),
    ],
  };
  const BOTH = { sweep: "match_correct_only", view: "as_of" };
  const DROPPED = [
    "1 instance outside Correct matches only",
    "1 instance published after the HEAD cutoff",
  ];

  function caption(
    rows: FigureRows,
    metric: FigureMetricId,
    chart_form: string,
    filters: Record<string, string> = {},
  ): unknown {
    return computeFigureData(rows, {
      metric,
      chart_form,
      group_by: null,
      filters,
    }).caption;
  }

  it("counts a concentration Figure's whole sample without a filter", () => {
    expect(caption(FILTERED, "concentration", "line")).toEqual({
      n: "n = 4 projects at HEAD, 6 packages, 10 vulnerability instances",
      exclusions: [],
    });
  });

  it("counts what a concentration Figure's filters keep", () => {
    expect(caption(FILTERED, "concentration", "line", BOTH)).toEqual({
      n: "n = 4 projects at HEAD, 4 packages, 8 vulnerability instances",
      exclusions: DROPPED,
    });
  });

  it("counts the instances a severity mix draws", () => {
    expect(caption(FILTERED, "severity_mix", "bar", BOTH)).toEqual({
      n: "n = 8 vulnerability instances in 4 projects at HEAD",
      exclusions: DROPPED,
    });
  });

  it("counts plotted projects and filtered instances on stars vs load", () => {
    expect(caption(FILTERED, "stars_vs_load", "scatter", BOTH)).toEqual({
      n: "n = 4 projects with dependencies at HEAD",
      exclusions: DROPPED,
    });
  });

  it("names projects a stars vs load Figure cannot plot", () => {
    const rows: FigureRows = {
      ...COHORT,
      runs: [...COHORT.runs, headRun("r5")],
      summaries: [
        ...COHORT.summaries,
        { ...summary("r5", 4, 0), total_dependencies: 0 },
      ],
    };
    expect(caption(rows, "stars_vs_load", "scatter")).toEqual({
      n: "n = 4 projects with dependencies at HEAD",
      exclusions: ["1 project without dependencies"],
    });
  });

  describe("residence", () => {
    const INTRODUCED = entry("e1", "CRITICAL", "2025-05-20", [
      ["2024-12-01", false],
      ["2025-02-21", true],
      ["2025-06-01", true],
    ]);
    const OTHER = entry("e2", "HIGH", "2025-02-20", [
      ["2024-12-01", false],
      ["2025-02-20", true],
      ["2025-06-01", true],
    ]);

    it("counts introductions on or before disclosure", () => {
      expect(
        caption(rowsOf([INTRODUCED, OTHER]), "residence", "histogram"),
      ).toEqual({
        n: "n = 2 introductions on or before disclosure",
        exclusions: [],
      });
    });

    it("names what precision and date range filters dropped", () => {
      const rows = rowsOf([INTRODUCED, OTHER]);
      expect(
        caption(rows, "residence", "quartiles", {
          dating_precision: "commit",
        }),
      ).toEqual({
        n: "n = 0 introductions on or before disclosure",
        exclusions: ["2 introductions outside Dated to a commit"],
      });
      expect(
        caption(rows, "residence", "histogram", {
          date_range: "2025-02-21/2025-12-31",
        }),
      ).toEqual({
        n: "n = 1 introduction on or before disclosure",
        exclusions: ["1 introduction outside the date range"],
      });
    });

    it("names exposures and introductions the measure cannot use", () => {
      const present = entry("e3", "LOW", "2025-05-20", [
        ["2024-12-01", true],
        ["2025-02-21", true],
        ["2025-06-01", true],
      ]);
      const late = entry("e4", "LOW", "2025-01-01", [
        ["2024-12-01", false],
        ["2025-02-21", true],
        ["2025-06-01", true],
      ]);
      expect(
        caption(rowsOf([INTRODUCED, present, late]), "residence", "histogram"),
      ).toEqual({
        n: "n = 1 introduction on or before disclosure",
        exclusions: [
          "1 exposure present at the first snapshot",
          "1 introduction after disclosure",
        ],
      });
    });
  });

  describe("upstream leverage", () => {
    const FIXED = entry("e1", "HIGH", "2024-06-01", [
      ["2024-12-01", true],
      ["2025-02-01", true],
      ["2025-06-01", false],
    ]);
    const rows = rowsOf([FIXED]);

    it("counts the projects behind the packages-to-clear lines", () => {
      expect(caption(rows, "upstream_leverage", "line")).toEqual({
        n: "n = 1 project with a done snapshot per grid date",
        exclusions: [],
      });
    });

    it("names grid dates and instances the line's filters dropped", () => {
      const wrong = entry("e2", "HIGH", "2024-06-01", [
        ["2024-12-01", true],
        ["2025-02-01", false],
        ["2025-06-01", false],
      ]);
      wrong.vulnerabilities[0]!.conflict_flag = "INCORRECT";
      expect(
        caption(rowsOf([FIXED, wrong]), "upstream_leverage", "line", {
          sweep: "match_correct_only",
          date_range: "2025-02-01/2025-12-31",
        }),
      ).toEqual({
        n: "n = 2 projects with a done snapshot per grid date",
        exclusions: [
          "1 instance outside Correct matches only",
          "2 grid dates outside the date range",
        ],
      });
    });

    it("counts the fixes of the shown intervals", () => {
      expect(caption(rows, "upstream_leverage", "bar")).toEqual({
        n: "n = 1 fix in 2 intervals",
        exclusions: [],
      });
    });

    it("names fixes the precision and date range filters dropped", () => {
      expect(
        caption(rows, "upstream_leverage", "bar", {
          dating_precision: "commit",
        }),
      ).toEqual({
        n: "n = 0 fixes in 2 intervals",
        exclusions: ["1 fix outside Dated to a commit"],
      });
      expect(
        caption(rows, "upstream_leverage", "bar", {
          date_range: "2025-02-01/2025-12-31",
        }),
      ).toEqual({
        n: "n = 0 fixes in 1 interval",
        exclusions: ["1 fix outside the date range"],
      });
    });
  });
});
