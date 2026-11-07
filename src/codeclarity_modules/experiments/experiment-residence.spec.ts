import {
  aggregateExperimentResults,
  type ExperimentResultsInput,
  type ResultsRunInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";

// Each entry has three snapshots (2025-01-01, 2025-03-01, HEAD). A snapshot
// lists its pinned commit's date and whether the vulnerable package is there.
const GRID = ["2025-01-01", "2025-03-01", null];

interface Vuln {
  severity: string;
  published: string | null;
}

function entry(
  id: string,
  vuln: Vuln,
  snapshots: [committed: string, present: boolean][],
): { runs: ResultsRunInput[]; vulnerabilities: ResultsVulnerabilityInput[] } {
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
    if (!present) return;
    vulnerabilities.push({
      run_id: runId,
      vulnerability_id: `DEMO-${id}`,
      affected_dependency: "lodash",
      severity_class: vuln.severity,
      published_date: vuln.published,
      epss_score: null,
      conflict_flag: "MATCH_CORRECT",
      winning_source: "OSV",
      withdrawn_date: null,
    });
  });
  return { runs, vulnerabilities };
}

function input(...entries: ReturnType<typeof entry>[]): ExperimentResultsInput {
  return {
    runs: entries.flatMap((e) => e.runs),
    summaries: [],
    vulnerabilities: entries.flatMap((e) => e.vulnerabilities),
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
  };
}

describe("pre-disclosure residence in the results", () => {
  const results = aggregateExperimentResults(
    input(
      // Introduced 2025-02-21, published 2025-05-20: 88 days unknown
      entry("e1", { severity: "CRITICAL", published: "2025-05-20" }, [
        ["2024-12-01", false],
        ["2025-02-21", true],
        ["2025-06-01", true],
      ]),
      // Introduced on the day of publication: residence 0
      entry("e2", { severity: "HIGH", published: "2025-02-20T09:00:00Z" }, [
        ["2024-12-01", false],
        ["2025-02-20", true],
        ["2025-06-01", true],
      ]),
      // Introduced 2025-05-20, already published 2025-02-10
      entry("e3", { severity: "HIGH", published: "2025-02-10" }, [
        ["2024-12-01", false],
        ["2025-02-01", false],
        ["2025-05-20", true],
      ]),
      // Present at the first grid date: no introduction
      entry("e4", { severity: "LOW", published: "2025-04-01" }, [
        ["2024-12-01", true],
        ["2025-02-21", true],
        ["2025-06-01", false],
      ]),
      // Introduced, but the advisory has no publication date
      entry("e5", { severity: "MEDIUM", published: null }, [
        ["2024-12-01", false],
        ["2025-02-21", true],
        ["2025-06-01", true],
      ]),
    ),
  );

  it("summarises introduction to publication over introductions on or before disclosure", () => {
    expect(results.residence.introductions).toBe(4);
    expect(results.residence.snapshot_precision_share).toBe(1);
    expect(results.residence.present_at_first_observation).toBe(1);
    expect(results.residence.undated).toBe(1);
    expect(results.residence.overall).toEqual({ n: 2, median: 44, p25: 22, p75: 66, min: 0, max: 88 });
    expect(results.residence.by_severity).toEqual([
      { key: "CRITICAL", n: 1, median: 88, p25: 88, p75: 88, min: 88, max: 88 },
      { key: "HIGH", n: 1, median: 0, p25: 0, p75: 0, min: 0, max: 0 },
    ]);
    expect(results.residence.points).toEqual([
      { severity: "CRITICAL", residence_days: 88, precision: "snapshot" },
      { severity: "HIGH", residence_days: 0, precision: "snapshot" },
    ]);
  });

  it("counts introductions after disclosure apart, by days since publication", () => {
    expect(results.residence.after_disclosure).toEqual({ n: 1, median: 99, p25: 99, p75: 99, min: 99, max: 99 });
    expect(results.residence.after_disclosure_by_severity).toEqual([
      { key: "HIGH", n: 1, median: 99, p25: 99, p75: 99, min: 99, max: 99 },
    ]);
    expect(results.residence.points.every((p) => p.residence_days >= 0)).toBe(true);
  });

  it("is empty without introductions", () => {
    const empty = { n: 0, median: null, p25: null, p75: null, min: null, max: null };
    expect(aggregateExperimentResults(input()).residence).toEqual({
      introductions: 0,
      snapshot_precision_share: null,
      present_at_first_observation: 0,
      undated: 0,
      overall: empty,
      by_severity: [],
      points: [],
      after_disclosure: empty,
      after_disclosure_by_severity: [],
    });
  });
});
