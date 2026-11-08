import {
  aggregateExperimentResults,
  type ExperimentResultsInput,
  type ResultsSummaryInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";

function summary(run_id: string, rank: number): ResultsSummaryInput {
  return {
    run_id,
    rank,
    total_dependencies: 100,
    total_vulnerabilities: 0,
    package_manager: "NPM",
  };
}

function vuln(
  run_id: string,
  affected_dependency: string,
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
      ended_on: new Date("2026-11-02T00:00:00Z"),
    },
    ...fields,
  };
}

describe("bootstrap intervals on experiment results", () => {
  it("gives the 95% percentile interval of the median load", () => {
    // Two projects with loads 1 and 3: a resample's median is 1, 2 or 3
    const results = aggregateExperimentResults(
      input({
        summaries: [summary("a", 0), summary("b", 1)],
        vulnerabilities: [
          vuln("a", "x"),
          vuln("b", "x"),
          vuln("b", "y"),
          vuln("b", "z"),
        ],
      }),
    );
    expect(results.bootstrap_intervals?.headline.load_median).toEqual({
      low: 1,
      high: 3,
    });
  });

  /** Project a has one instance of x; b has one each of x, y and z. */
  function twoProjects(): Partial<ExperimentResultsInput> {
    return {
      summaries: [summary("a", 0), summary("b", 1)],
      vulnerabilities: [
        vuln("a", "x"),
        vuln("b", "x"),
        vuln("b", "y"),
        vuln("b", "z"),
      ],
    };
  }

  it("bootstraps the Gini of project loads", () => {
    // Loads 1 and 3: resamples give Gini 0 (same project twice) or 0.25
    const { bootstrap_intervals: intervals } = aggregateExperimentResults(
      input(twoProjects()),
    );
    expect(intervals?.headline.gini_proj).toEqual({ low: 0, high: 0.25 });
  });

  it("bootstraps the Gini of package counts over the drawn projects", () => {
    // Drawing a and b gives counts 2, 1, 1 (Gini 1/6); a or b twice gives 0
    const { bootstrap_intervals: intervals } = aggregateExperimentResults(
      input(twoProjects()),
    );
    expect(intervals?.headline.gini_pkg?.low).toBe(0);
    expect(intervals?.headline.gini_pkg?.high).toBeCloseTo(1 / 6, 12);
  });

  it("gives each sweep subset its own intervals", () => {
    const fields = twoProjects();
    fields.vulnerabilities![3]!.conflict_flag = "MATCH_INCORRECT";
    const { bootstrap_intervals: intervals } = aggregateExperimentResults(
      input(fields),
    );
    // Without z the loads are 1 and 2, so the median tops out at 2
    expect(intervals?.sweep.match_correct_only.load_median?.high).toBe(2);
    expect(intervals?.sweep.all.load_median?.high).toBe(3);
  });

  it("gives identical intervals whatever order the rows arrive in", () => {
    const ranks = Array.from({ length: 30 }, (_, i) => i);
    const summaries = ranks.map((i) => summary(`r${i}`, i));
    const vulnerabilities = ranks.flatMap((i) =>
      Array.from({ length: (i * 7) % 11 }, (_, k) => vuln(`r${i}`, `p${k}`)),
    );
    const first = aggregateExperimentResults(
      input({ summaries, vulnerabilities }),
    );
    const second = aggregateExperimentResults(
      input({
        summaries: [...summaries].reverse(),
        vulnerabilities: [...vulnerabilities].reverse(),
      }),
    );
    expect(first.bootstrap_intervals).not.toBeNull();
    expect(second.bootstrap_intervals).toEqual(first.bootstrap_intervals);
  });

  it("states the seed and method in the provenance", () => {
    const { provenance } = aggregateExperimentResults(input());
    expect(provenance.bootstrap).toEqual({
      method: "percentile bootstrap, resampling by project",
      confidence: 0.95,
      resamples: 10_000,
      seed: expect.any(Number),
    });
  });

  it("bootstraps the EPSS median by project", () => {
    const scored = (run: string, score: number): ResultsVulnerabilityInput => ({
      ...vuln(run, "x"),
      epss_score: score,
    });
    const { bootstrap_intervals: intervals } = aggregateExperimentResults(
      input({
        summaries: [summary("a", 0), summary("b", 1)],
        vulnerabilities: [scored("a", 0.1), scored("b", 0.3)],
      }),
    );
    expect(intervals?.epss_median?.low).toBeCloseTo(0.1, 12);
    expect(intervals?.epss_median?.high).toBeCloseTo(0.3, 12);
  });

  it("bootstraps per package manager medians", () => {
    const { bootstrap_intervals: intervals } = aggregateExperimentResults(
      input({
        summaries: [
          { ...summary("a", 0), total_dependencies: 10 },
          { ...summary("b", 1), total_dependencies: 30 },
        ],
      }),
    );
    expect(intervals?.rqd["NPM"]?.med_deps).toEqual({ low: 10, high: 30 });
  });

  describe("over exposures", () => {
    const at = (day: string): Date => new Date(`${day}T12:00:00Z`);

    /** An exposure present only at the middle of three snapshots. */
    function project(
      entryId: string,
      published: string[],
    ): Partial<ExperimentResultsInput> {
      const days = ["2025-01-01", "2025-03-01", "2025-05-01"];
      const runs = days.map((day, grid_index) => ({
        status: "done",
        error: null,
        dataset_entry_id: entryId,
        grid_index,
        grid_date: grid_index === 2 ? null : at(day),
        rows_run_id: `${entryId}-${grid_index}`,
        commit_hash: `${entryId}-c${grid_index}`,
        committed_at: at(day),
      }));
      const vulnerabilities = published.map((published_date, i) => ({
        ...vuln(`${entryId}-1`, `pkg-${i}`),
        vulnerability_id: `DEMO-${entryId}-${i}`,
        published_date,
      }));
      return { runs, vulnerabilities };
    }

    function merge(
      ...parts: Partial<ExperimentResultsInput>[]
    ): ExperimentResultsInput {
      return input({
        runs: parts.flatMap((p) => p.runs ?? []),
        vulnerabilities: parts.flatMap((p) => p.vulnerabilities ?? []),
      });
    }

    it("moves all of a project's exposures in or out together", () => {
      // One project cannot vary between resamples, however different its lags
      const results = aggregateExperimentResults(
        merge(project("e1", ["2025-02-01", "2025-04-01", "2025-08-01"])),
      );
      const median = results.fix_lag.overall.median!;
      expect(results.fix_lag.overall.n).toBe(3);
      expect(results.bootstrap_intervals?.fix_lag.overall).toEqual({
        low: median,
        high: median,
      });
      const residence = results.residence.overall.median!;
      expect(results.bootstrap_intervals?.residence.overall).toEqual({
        low: residence,
        high: residence,
      });
    });

    it("spans the projects' medians for two projects", () => {
      const results = aggregateExperimentResults(
        merge(project("e1", ["2025-04-01"]), project("e2", ["2025-08-01"])),
      );
      const lags = results.fix_lag.points.map((p) => p.lag_days);
      expect(results.bootstrap_intervals?.fix_lag.overall).toEqual({
        low: Math.min(...lags),
        high: Math.max(...lags),
      });
      expect(
        results.bootstrap_intervals?.fix_lag.by_severity["MEDIUM"],
      ).toEqual(results.bootstrap_intervals?.fix_lag.overall);
      expect(
        results.bootstrap_intervals?.fix_lag.by_kind["unknown"],
      ).toBeDefined();
      expect(
        results.bootstrap_intervals?.residence.by_severity["MEDIUM"],
      ).toEqual(results.bootstrap_intervals?.residence.overall);
    });

    it("bootstraps residence after disclosure on its own", () => {
      // Both advisories predate the introductions, so residence is negative
      const results = aggregateExperimentResults(
        merge(project("e1", ["2024-01-01"]), project("e2", ["2024-06-01"])),
      );
      const days = results.residence.after_disclosure;
      expect(results.bootstrap_intervals?.residence.after_disclosure).toEqual({
        low: days.min,
        high: days.max,
      });
    });
  });
});
