import {
  aggregateExperimentResults,
  type ExperimentResultsInput,
  type KnowledgeSnapshot,
  type ResultsSummaryInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";

function summary(
  run_id: string,
  rank: number,
  fields: Partial<ResultsSummaryInput> = {},
): ResultsSummaryInput {
  return {
    run_id,
    rank,
    total_dependencies: 100,
    total_vulnerabilities: 0,
    package_manager: "NPM",
    ...fields,
  };
}

function vuln(
  run_id: string,
  affected_dependency: string | null,
  fields: Partial<ResultsVulnerabilityInput> = {},
): ResultsVulnerabilityInput {
  return {
    run_id,
    affected_dependency,
    vulnerability_id: "CVE-2024-0001",
    severity_class: "MEDIUM",
    epss_score: null,
    conflict_flag: "MATCH_CORRECT",
    winning_source: "OSV",
    withdrawn_date: null,
    ...fields,
  };
}

function input(
  fields: Partial<ExperimentResultsInput> = {},
): ExperimentResultsInput {
  return {
    runs: [],
    summaries: [],
    vulnerabilities: [],
    provenance: {
      api_version: "1.0.0",
      analyzer_steps: null,
      knowledge_start: null,
      knowledge_end: null,
      created_by: null,
      created_on: new Date("2026-11-01T00:00:00Z"),
      started_on: null,
      ended_on: null,
    },
    ...fields,
  };
}

/** Three done runs: r1 carries 4 instances, r2 carries 2, r3 none. */
const threeRuns = input({
  summaries: [summary("r1", 0), summary("r2", 1), summary("r3", 2)],
  vulnerabilities: [
    vuln("r1", "a", { severity_class: "CRITICAL" }),
    vuln("r1", "a", { severity_class: "HIGH" }),
    vuln("r1", "a", { severity_class: "low" }),
    vuln("r1", "b", { severity_class: null }),
    vuln("r2", "a", { severity_class: "MEDIUM" }),
    vuln("r2", null, { severity_class: "HIGH" }),
  ],
});

describe("aggregateExperimentResults", () => {
  describe("headline", () => {
    it("summarises prevalence, load, severity and concentration over done runs", () => {
      const { headline } = aggregateExperimentResults(threeRuns);
      expect(headline).toEqual({
        n_projects: 3,
        n_affected: 2,
        affected_share: 2 / 3,
        // instances count packaged rows only; the load of r2 counts both
        instances: 5,
        distinct_vuln_packages: 2,
        load_median: 2,
        load_mean: 2,
        load_max: 4,
        sev_counts: { CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 1, NONE: 1 },
        high_critical_share: 3 / 5,
        top10_pkg_share: 1,
        top10_proj_share: 1,
        // packages [1, 4]: (2 * 9 - 3 * 5) / (2 * 5)
        gini_pkg: expect.closeTo(0.3, 12) as number,
        // projects [0, 2, 4]: (2 * 16 - 4 * 6) / (3 * 6)
        gini_proj: expect.closeTo(8 / 18, 12) as number,
        pkgs_clear_50: 1,
        pkgs_clear_80: 1,
        pkgs_clear_90: 2,
        top_packages: [
          ["a", 2],
          ["b", 1],
        ],
        high_critical_share_of_classed: 3 / 4,
      });
    });

    it("has null shares and no packages to clear without done runs", () => {
      const { headline } = aggregateExperimentResults(input());
      expect(headline).toMatchObject({
        n_projects: 0,
        affected_share: null,
        load_median: null,
        load_mean: null,
        load_max: null,
        high_critical_share: null,
        gini_pkg: null,
        gini_proj: null,
        pkgs_clear_50: 0,
        top_packages: [],
        high_critical_share_of_classed: null,
      });
    });

    it("ignores instances of runs that are not done", () => {
      const { headline } = aggregateExperimentResults(
        input({
          summaries: [summary("r1", 0)],
          vulnerabilities: [vuln("r1", "a"), vuln("gone", "b")],
        }),
      );
      expect(headline.instances).toBe(1);
      expect(headline.top_packages).toEqual([["a", 1]]);
    });

    it("ranks top packages by projects affected, ties alphabetically", () => {
      const { headline } = aggregateExperimentResults(
        input({
          summaries: [summary("r1", 0), summary("r2", 1)],
          vulnerabilities: [
            vuln("r1", "zod"),
            vuln("r1", "zod"),
            vuln("r1", "ajv"),
            vuln("r2", "minimist"),
            vuln("r2", "zod"),
          ],
        }),
      );
      expect(headline.top_packages).toEqual([
        ["zod", 2],
        ["ajv", 1],
        ["minimist", 1],
      ]);
    });
  });

  describe("sweep", () => {
    it("recomputes the headline scalars per subset over the same runs", () => {
      const { sweep } = aggregateExperimentResults(
        input({
          summaries: [summary("r1", 0), summary("r2", 1)],
          vulnerabilities: [
            vuln("r1", "a"),
            vuln("r1", "b", { conflict_flag: "MATCH_POSSIBLE_INCORRECT" }),
            vuln("r2", "c", { withdrawn_date: "2024-01-01T00:00:00Z" }),
          ],
        }),
      );
      expect(sweep.map((row) => [row.subset, row.n_projects, row.instances])).toEqual([
        ["all", 2, 3],
        ["match_correct_only", 2, 2],
        ["non_withdrawn", 2, 2],
      ]);
      expect(sweep[0]).not.toHaveProperty("top_packages");
      expect(sweep[0]).not.toHaveProperty("sev_counts");
    });
  });

  describe("epss", () => {
    it("reports coverage, distribution and why scores are missing", () => {
      const { epss } = aggregateExperimentResults(
        input({
          summaries: [summary("r1", 0)],
          vulnerabilities: [
            vuln("r1", "a", { epss_score: 0.01 }),
            vuln("r1", "a", { epss_score: 0.2 }),
            vuln("r1", "a", { epss_score: 0.6 }),
            vuln("r1", "a", { epss_score: 0.5 }),
            vuln("r1", "a", { vulnerability_id: "GHSA-xxxx" }),
            vuln("r1", "a", { vulnerability_id: "CVE-2020-1" }),
          ],
        }),
      );
      expect(epss).toEqual({
        nonnull_share: 4 / 6,
        median: expect.closeTo(0.35, 12) as number,
        // position 3 * 0.9 = 2.7 in [0.01, 0.2, 0.5, 0.6]
        p90: expect.closeTo(0.57, 12) as number,
        over_10pct: 3,
        over_50pct: 1,
        missing_non_cve: 1,
        missing_cve: 1,
      });
    });
  });

  describe("mixes", () => {
    it("counts conflict flags and winning sources, most frequent first", () => {
      const results = aggregateExperimentResults(
        input({
          summaries: [summary("r1", 0)],
          vulnerabilities: [
            vuln("r1", "a", { winning_source: "NVD" }),
            vuln("r1", "a", { conflict_flag: null, winning_source: "GCVE" }),
            vuln("r1", "a", { winning_source: "GCVE" }),
          ],
        }),
      );
      expect(results.match_flags).toEqual({ MATCH_CORRECT: 2 });
      expect(Object.entries(results.winning_source_head)).toEqual([
        ["GCVE", 2],
        ["NVD", 1],
      ]);
    });
  });

  describe("rqc and rqd", () => {
    const runs = input({
      summaries: [
        summary("r1", 0, { total_dependencies: 0, package_manager: null }),
        summary("r2", 1, { total_dependencies: 10, total_vulnerabilities: 1 }),
        summary("r3", 2, { total_dependencies: 30, total_vulnerabilities: 3 }),
        summary("r4", 3, { total_dependencies: 20, total_vulnerabilities: 4, package_manager: "YARN" }),
      ],
    });

    it("correlates star rank with load over runs that have dependencies", () => {
      expect(aggregateExperimentResults(runs).rqc).toEqual({
        spearman_rho: 1,
        p: 0,
        n: 3,
        excluded_zero_dep_projects: 1,
      });
    });

    it("gives medians per package manager, sorted by name", () => {
      expect(aggregateExperimentResults(runs).rqd).toEqual([
        { package_manager: "NPM", projects: 2, med_deps: 20, med_vulns: 2 },
        { package_manager: "YARN", projects: 1, med_deps: 20, med_vulns: 4 },
      ]);
    });

    it("leaves rho and p null when they are undefined", () => {
      expect(aggregateExperimentResults(input()).rqc).toEqual({
        spearman_rho: null,
        p: null,
        n: 0,
        excluded_zero_dep_projects: 0,
      });
    });
  });

  describe("coverage", () => {
    it("counts runs per state and the reasons runs failed or were skipped", () => {
      const { coverage } = aggregateExperimentResults(
        input({
          runs: [
            { status: "done", error: null },
            { status: "failed", error: "missing result: js-sbom" },
            { status: "failed", error: "missing result: js-sbom" },
            { status: "failed", error: "ceiling" },
            { status: "skipped", error: "repository not found" },
            { status: "pending", error: null },
          ],
        }),
      );
      expect(coverage).toEqual({
        runs: 6,
        attempted: 5,
        done: 1,
        failed: 3,
        skipped: 1,
        pending: 1,
        failure_reasons: { "missing result: js-sbom": 2, ceiling: 1 },
        skip_reasons: { "repository not found": 1 },
      });
    });
  });

  describe("snapshot grid", () => {
    const grid = new Date("2026-10-07T00:00:00Z");
    /**
     * Entry a: a grid run with its own rows and a HEAD run with its own.
     * Entry b: a grid run whose rows HEAD shares (same commit). Entry c:
     * a grid run that failed and a HEAD run that was skipped.
     */
    const gridExperiment = input({
      runs: [
        { status: "done", error: null, grid_date: grid, rows_run_id: "a0" },
        { status: "done", error: null, grid_date: null, rows_run_id: "aH" },
        { status: "done", error: null, grid_date: grid, rows_run_id: "b0" },
        { status: "done", error: null, grid_date: null, rows_run_id: "b0" },
        { status: "failed", error: "ceiling", grid_date: grid, rows_run_id: "c0" },
        { status: "skipped", error: "gone", grid_date: null, rows_run_id: "cH" },
      ],
      summaries: [summary("a0", 0), summary("aH", 0), summary("b0", 1)],
      vulnerabilities: [
        vuln("a0", "old"),
        vuln("a0", "old"),
        vuln("a0", "old"),
        vuln("aH", "new"),
        vuln("b0", "shared"),
      ],
    });

    it("computes the existing blocks over the HEAD snapshot only", () => {
      const { headline } = aggregateExperimentResults(gridExperiment);

      expect(headline).toMatchObject({
        n_projects: 2,
        instances: 2,
        top_packages: [
          ["new", 1],
          ["shared", 1],
        ],
      });
    });

    it("counts coverage over the HEAD runs", () => {
      const { coverage } = aggregateExperimentResults(gridExperiment);

      expect(coverage).toMatchObject({
        runs: 3,
        done: 2,
        failed: 0,
        skipped: 1,
        skip_reasons: { gone: 1 },
      });
    });

    it("counts coverage per grid date, oldest first and HEAD last", () => {
      const { grid_coverage } = aggregateExperimentResults(gridExperiment);

      expect(grid_coverage).toEqual([
        { grid_date: "2026-10-07", runs: 3, done: 2, empty: 0, failed: 1, skipped: 0, pending: 0, mixed_knowledge: false },
        { grid_date: null, runs: 3, done: 2, empty: 0, failed: 0, skipped: 1, pending: 0, mixed_knowledge: false },
      ]);
    });

    it("counts a done run with no lockfile yet as empty, and pending runs per date", () => {
      const older = new Date("2026-09-07T00:00:00Z");
      const { grid_coverage } = aggregateExperimentResults(
        input({
          runs: [
            { status: "pending", error: null, grid_date: null, rows_run_id: "aH" },
            { status: "done", error: null, grid_date: grid, rows_run_id: "a1" },
            { status: "done", error: "no_lockfile_yet", grid_date: older, rows_run_id: "a0" },
          ],
        }),
      );

      expect(grid_coverage).toEqual([
        { grid_date: "2026-09-07", runs: 1, done: 0, empty: 1, failed: 0, skipped: 0, pending: 0, mixed_knowledge: false },
        { grid_date: "2026-10-07", runs: 1, done: 1, empty: 0, failed: 0, skipped: 0, pending: 0, mixed_knowledge: false },
        { grid_date: null, runs: 1, done: 0, empty: 0, failed: 0, skipped: 0, pending: 1, mixed_knowledge: false },
      ]);
    });

    it("gives a HEAD-only experiment a single HEAD coverage row", () => {
      const { grid_coverage } = aggregateExperimentResults(
        input({ runs: [{ status: "done", error: null }, { status: "failed", error: "x" }] }),
      );

      expect(grid_coverage).toEqual([
        { grid_date: null, runs: 2, done: 1, empty: 0, failed: 1, skipped: 0, pending: 0, mixed_knowledge: false },
      ]);
    });
  });

  describe("mixed knowledge per grid date", () => {
    const grid = new Date("2026-10-07T00:00:00Z");
    const knowledge = (nvd: string, epss_rows = 10): KnowledgeSnapshot => ({
      knowledge_sources: { nvd, osv: "2026-11-01T00:00:00Z" },
      epss_rows,
    });
    const flags = (results: ReturnType<typeof aggregateExperimentResults>): [string | null, boolean][] =>
      results.grid_coverage.map((row) => [row.grid_date, row.mixed_knowledge]);

    it("flags a grid date whose runs were matched against different knowledge", () => {
      const results = aggregateExperimentResults(
        input({
          runs: [
            { status: "done", error: null, grid_date: grid, knowledge: knowledge("2026-11-01T00:00:00Z") },
            { status: "done", error: null, grid_date: grid, knowledge: knowledge("2026-11-02T00:00:00Z") },
            { status: "done", error: null, grid_date: null, knowledge: knowledge("2026-11-02T00:00:00Z") },
            { status: "done", error: null, grid_date: null, knowledge: knowledge("2026-11-02T00:00:00Z") },
          ],
        }),
      );

      expect(flags(results)).toEqual([
        ["2026-10-07", true],
        [null, false],
      ]);
    });

    it("counts a change in EPSS rows as different knowledge", () => {
      const results = aggregateExperimentResults(
        input({
          runs: [
            { status: "done", error: null, knowledge: knowledge("2026-11-01T00:00:00Z", 10) },
            { status: "done", error: null, knowledge: knowledge("2026-11-01T00:00:00Z", 11) },
          ],
        }),
      );

      expect(flags(results)).toEqual([[null, true]]);
    });

    it("ignores runs without recorded knowledge, such as empty, failed or v1 runs", () => {
      const results = aggregateExperimentResults(
        input({
          runs: [
            { status: "done", error: null, grid_date: grid, knowledge: knowledge("2026-11-01T00:00:00Z") },
            { status: "done", error: "no_lockfile_yet", grid_date: grid, knowledge: null },
            { status: "failed", error: "ceiling", grid_date: grid },
            { status: "done", error: null, grid_date: null },
          ],
        }),
      );

      expect(flags(results)).toEqual([
        ["2026-10-07", false],
        [null, false],
      ]);
    });
  });

  describe("provenance", () => {
    const snapshot = (nvd: string): object => ({
      knowledge_sources: { nvd, osv: "2026-11-01T00:00:00Z" },
      epss_rows: 10,
    });

    it("flags knowledge that changed between start and end", () => {
      const base = input().provenance;
      const changed = aggregateExperimentResults(
        input({
          provenance: {
            ...base,
            knowledge_start: snapshot("2026-11-01T00:00:00Z") as never,
            knowledge_end: snapshot("2026-11-02T00:00:00Z") as never,
          },
        }),
      ).provenance;
      expect(changed.knowledge_changed).toBe(true);
      expect(changed.api_version).toBe("1.0.0");
      expect(changed.created_on).toEqual(base.created_on);

      const same = aggregateExperimentResults(
        input({
          provenance: {
            ...base,
            knowledge_start: snapshot("2026-11-01T00:00:00Z") as never,
            knowledge_end: snapshot("2026-11-01T00:00:00Z") as never,
          },
        }),
      ).provenance;
      expect(same.knowledge_changed).toBe(false);
    });

    it("flags a change in the EPSS rows even when every source is unchanged", () => {
      const base = input().provenance;
      const changed = aggregateExperimentResults(
        input({
          provenance: {
            ...base,
            knowledge_start: snapshot("2026-11-01T00:00:00Z") as never,
            knowledge_end: {
              knowledge_sources: {
                nvd: "2026-11-01T00:00:00Z",
                osv: "2026-11-01T00:00:00Z",
              },
              epss_rows: 12,
            },
          },
        }),
      ).provenance;
      expect(changed.knowledge_changed).toBe(true);
    });

    it("does not flag a change before the end snapshot exists", () => {
      const base = input().provenance;
      const running = aggregateExperimentResults(
        input({
          provenance: {
            ...base,
            knowledge_start: snapshot("2026-11-01T00:00:00Z") as never,
          },
        }),
      ).provenance;
      expect(running.knowledge_changed).toBe(false);
      expect(running.knowledge_end).toBeNull();
    });
  });
});
