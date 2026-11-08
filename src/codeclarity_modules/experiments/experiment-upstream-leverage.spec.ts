import {
  aggregateExperimentResults,
  type ExperimentResultsInput,
  type ResultsProbeInput,
  type ResultsRunInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";

const GRID = ["2025-01-01", "2025-02-01", "2025-03-01", null] as const;

/** One run per grid date for an entry; statuses default to done. */
function runs(
  entry: string,
  statuses: string[] = ["done", "done", "done", "done"],
): ResultsRunInput[] {
  return GRID.map((date, i) => ({
    status: statuses[i]!,
    error: statuses[i] === "done" ? null : "analysis failed",
    grid_date: date === null ? null : new Date(`${date}T00:00:00Z`),
    rows_run_id: `${entry}-${i}`,
    dataset_entry_id: entry,
    grid_index: i,
    commit_hash: `${entry}-c${i}`,
    committed_at: new Date(`${date ?? "2025-04-01"}T00:00:00Z`),
  }));
}

/** Instances of one package in one snapshot run. */
function hits(
  run_id: string,
  pkg: string,
  count = 1,
  fields: Partial<ResultsVulnerabilityInput> = {},
): ResultsVulnerabilityInput[] {
  return Array.from({ length: count }, (_, i) => ({
    run_id,
    affected_dependency: pkg,
    vulnerability_id: `VULN-${pkg}-${i}`,
    severity_class: "HIGH",
    epss_score: null,
    conflict_flag: "MATCH_CORRECT",
    winning_source: "OSV",
    withdrawn_date: null,
    published_date: "2024-12-01",
    direct_dependency: false,
    ...fields,
  }));
}

/** The packages an entry resolves at its snapshot of a grid index. */
function probe(
  entry: string,
  gridIndex: number,
  names: string[],
): ResultsProbeInput {
  return {
    dataset_entry_id: entry,
    commit_hash: `${entry}-c${gridIndex}`,
    packages: names.map((name) => ({
      workspace: ".",
      name,
      version: "9.9.9",
      direct: false,
    })),
  };
}

function input(
  fields: Partial<ExperimentResultsInput>,
): ExperimentResultsInput {
  return {
    runs: [],
    summaries: [],
    vulnerabilities: [],
    provenance: {
      api_version: null,
      analyzer_steps: null,
      knowledge_start: null,
      knowledge_end: null,
      created_by: null,
      created_on: new Date("2025-04-01T00:00:00Z"),
      started_on: null,
      ended_on: null,
    },
    ...fields,
  };
}

describe("upstream leverage over time", () => {
  it("counts the packages needed to clear 50% and 80% of instances per grid date", () => {
    const results = aggregateExperimentResults(
      input({
        runs: [
          ...runs("e1"),
          ...runs("e2", ["done", "done", "failed", "done"]),
        ],
        vulnerabilities: [
          // 2025-01-01: a 6, b 3, c 1 in one project
          ...hits("e1-0", "a", 6),
          ...hits("e1-0", "b", 3),
          ...hits("e1-0", "c", 1),
          // 2025-02-01: four packages, one instance each, over two projects
          ...hits("e1-1", "a"),
          ...hits("e1-1", "b"),
          ...hits("e2-1", "c"),
          ...hits("e2-1", "d"),
          // 2025-03-01: e2 failed, so only e1 is observed
          ...hits("e1-2", "a", 2),
          ...hits("e1-2", "b", 2),
        ],
      }),
    );

    expect(results.upstream_leverage.packages_to_clear).toEqual([
      {
        grid_date: "2025-01-01",
        projects: 2,
        instances: 10,
        distinct_packages: 3,
        pkgs_clear_50: 1,
        pkgs_clear_80: 2,
      },
      {
        grid_date: "2025-02-01",
        projects: 2,
        instances: 4,
        distinct_packages: 4,
        pkgs_clear_50: 2,
        pkgs_clear_80: 4,
      },
      {
        grid_date: "2025-03-01",
        projects: 1,
        instances: 4,
        distinct_packages: 2,
        pkgs_clear_50: 1,
        pkgs_clear_80: 2,
      },
      {
        grid_date: null,
        projects: 2,
        instances: 0,
        distinct_packages: 0,
        pkgs_clear_50: 0,
        pkgs_clear_80: 0,
      },
    ]);
  });

  it("leaves packages to clear null at a grid date with no done snapshot", () => {
    const results = aggregateExperimentResults(
      input({ runs: runs("e1", ["failed", "skipped", "pending", "done"]) }),
    );

    expect(
      results.upstream_leverage.packages_to_clear.map((row) => [
        row.grid_date,
        row.pkgs_clear_50,
        row.pkgs_clear_80,
      ]),
    ).toEqual([
      ["2025-01-01", null, null],
      ["2025-02-01", null, null],
      ["2025-03-01", null, null],
      [null, 0, 0],
    ]);
  });

  it("gives the share of removed_transitive fixes per grid interval, leaving unknown kinds out of the share", () => {
    const results = aggregateExperimentResults(
      input({
        runs: [...runs("e1"), ...runs("e2"), ...runs("e3"), ...runs("e4")],
        vulnerabilities: [
          // e1, fixed in (01-01, 02-01]: t removed transitively, u upgraded
          ...hits("e1-0", "t"),
          ...hits("e1-0", "u"),
          // e2, fixed in (02-01, 03-01]: t removed transitively
          ...hits("e2-0", "t"),
          ...hits("e2-1", "t"),
          // e3, fixed in (02-01, 03-01] with no probe row after it: unknown
          ...hits("e3-0", "t"),
          ...hits("e3-1", "t"),
          // e4, fixed in (03-01, HEAD] with no probe row after it: unknown
          ...hits("e4-0", "t"),
          ...hits("e4-1", "t"),
          ...hits("e4-2", "t"),
        ],
        probes: [probe("e1", 1, ["u", "express"]), probe("e2", 2, ["express"])],
      }),
    );

    expect(results.upstream_leverage.fix_kinds).toEqual([
      {
        interval_from: "2025-01-01",
        interval_to: "2025-02-01",
        fixes: 2,
        upgraded: 1,
        removed_direct: 0,
        removed_transitive: 1,
        unknown: 0,
        removed_transitive_share: 0.5,
        snapshot_precision_share: 1,
      },
      {
        interval_from: "2025-02-01",
        interval_to: "2025-03-01",
        fixes: 2,
        upgraded: 0,
        removed_direct: 0,
        removed_transitive: 1,
        unknown: 1,
        removed_transitive_share: 1,
        snapshot_precision_share: 1,
      },
      {
        interval_from: "2025-03-01",
        interval_to: null,
        fixes: 1,
        upgraded: 0,
        removed_direct: 0,
        removed_transitive: 0,
        unknown: 1,
        removed_transitive_share: null,
        snapshot_precision_share: 1,
      },
    ]);
    expect(results.upstream_leverage.overall).toEqual({
      fixes: 5,
      upgraded: 1,
      removed_direct: 0,
      removed_transitive: 2,
      unknown: 2,
      removed_transitive_share: 2 / 3,
      snapshot_precision_share: 1,
    });
  });

  it("gives the removed_transitive and snapshot dating shares 95% Wilson intervals", () => {
    const { share_intervals: intervals } = aggregateExperimentResults(
      input({
        runs: [...runs("e1"), ...runs("e2"), ...runs("e3"), ...runs("e4")],
        vulnerabilities: [
          ...hits("e1-0", "t"),
          ...hits("e1-0", "u"),
          ...hits("e2-0", "t"),
          ...hits("e2-1", "t"),
          ...hits("e3-0", "t"),
          ...hits("e3-1", "t"),
          ...hits("e4-0", "t"),
          ...hits("e4-1", "t"),
          ...hits("e4-2", "t"),
        ],
        probes: [probe("e1", 1, ["u", "express"]), probe("e2", 2, ["express"])],
      }),
    );

    const close = (
      interval: { low: number; high: number } | null | undefined,
      low: number,
      high: number,
    ): void => {
      expect(interval?.low).toBeCloseTo(low, 4);
      expect(interval?.high).toBeCloseTo(high, 4);
    };
    // 2 of 3 fixes of known kind were transitive
    close(intervals.removed_transitive.overall, 0.2077, 0.9385);
    // 1 of 2, 1 of 1, then an interval of unknown kinds only
    close(intervals.removed_transitive.by_interval[0], 0.0945, 0.9055);
    close(intervals.removed_transitive.by_interval[1], 0.2065, 1);
    expect(intervals.removed_transitive.by_interval[2]).toBeNull();
    // All 5 fixes are dated only to a snapshot interval
    close(intervals.fix_snapshot_precision, 0.5655, 1);
  });

  it("counts a direct removal as known but not transitive", () => {
    const results = aggregateExperimentResults(
      input({
        runs: runs("e1"),
        vulnerabilities: [...hits("e1-0", "m", 1, { direct_dependency: true })],
        probes: [probe("e1", 1, ["express"])],
      }),
    );

    expect(results.upstream_leverage.fix_kinds[0]).toMatchObject({
      fixes: 1,
      removed_direct: 1,
      removed_transitive_share: 0,
    });
  });

  it("has a single HEAD row and no intervals for a HEAD-only experiment", () => {
    const results = aggregateExperimentResults(
      input({
        runs: [
          { status: "done", error: null, grid_date: null, rows_run_id: "h" },
        ],
        vulnerabilities: hits("h", "a", 3),
      }),
    );

    expect(results.upstream_leverage).toEqual({
      packages_to_clear: [
        {
          grid_date: null,
          projects: 1,
          instances: 3,
          distinct_packages: 1,
          pkgs_clear_50: 1,
          pkgs_clear_80: 1,
        },
      ],
      fix_kinds: [],
      overall: {
        fixes: 0,
        upgraded: 0,
        removed_direct: 0,
        removed_transitive: 0,
        unknown: 0,
        removed_transitive_share: null,
        snapshot_precision_share: null,
      },
    });
  });
});
