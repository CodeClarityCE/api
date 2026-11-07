import {
  aggregateExperimentResults,
  type ExperimentResultsInput,
  type ResultsRunInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";
import { NO_LOCKFILE_YET } from "./experiment-row-copy";

// Monthly grid of three dates, then HEAD. Each snapshot is present (P),
// absent (A), empty before the lockfile (E) or failed (F).
const GRID = ["2025-01-01", "2025-02-01", "2025-03-01", null];
type State = "P" | "A" | "E" | "F";

/** One entry's runs and instances; commit dates are those of each snapshot. */
function entry(
  id: string,
  states: State[],
  commitDates: string[],
  severity = "MEDIUM",
): { runs: ResultsRunInput[]; vulnerabilities: ResultsVulnerabilityInput[] } {
  const runs: ResultsRunInput[] = [];
  const vulnerabilities: ResultsVulnerabilityInput[] = [];
  states.forEach((state, i) => {
    const runId = `${id}-${i}`;
    runs.push({
      status: state === "F" ? "failed" : "done",
      error: state === "E" ? NO_LOCKFILE_YET : null,
      dataset_entry_id: id,
      grid_index: i,
      grid_date: GRID[i] ? new Date(`${GRID[i]}T00:00:00Z`) : null,
      rows_run_id: runId,
      commit_hash: `${id}-c${i}`,
      committed_at: new Date(`${commitDates[i]}T12:00:00Z`),
    });
    if (state === "P") {
      vulnerabilities.push({
        run_id: runId,
        vulnerability_id: "CVE-2025-0001",
        affected_dependency: "lodash",
        severity_class: severity,
        published_date: "2024-12-01",
        epss_score: null,
        conflict_flag: "MATCH_CORRECT",
        winning_source: "OSV",
        withdrawn_date: null,
      });
    }
  });
  return { runs, vulnerabilities };
}

function input(
  entries: ReturnType<typeof entry>[],
  ended_on: Date | null = new Date("2025-04-15T09:00:00Z"),
): ExperimentResultsInput {
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
      created_on: new Date("2025-04-10T00:00:00Z"),
      started_on: new Date("2025-04-11T00:00:00Z"),
      ended_on,
    },
  };
}

const DATES = ["2024-12-20", "2025-01-15", "2025-02-20", "2025-04-01"];

describe("exposure survival in the results", () => {
  const results = aggregateExperimentResults(
    input([
      // Present from the first grid date, fixed at the 2025-02-20 snapshot: 50 days
      entry("e1", ["P", "P", "A", "A"], DATES),
      // Introduced 2025-01-15, a failed snapshot, still open at HEAD: censored at 90 days
      entry("e2", ["E", "P", "F", "P"], DATES),
      // Present throughout: censored at HEAD after 104 days
      entry("e3", ["P", "P", "P", "P"], DATES),
      // Fixed at the 2025-01-25 snapshot: 24 days
      entry("e4", ["P", "A", "A", "A"], ["2024-12-20", "2025-01-25", "2025-02-20", "2025-04-01"], "CRITICAL"),
    ]),
  );

  it("censors open exposures at HEAD and counts a failed snapshot as a gap, not a fix", () => {
    const { overall, censored_at } = results.exposure_survival;
    expect(censored_at).toBe("2025-04-15");
    expect(overall).toMatchObject({ key: "all", n: 4, fixed: 2, censored: 2, median_days: 50 });
    expect(overall.curve.map((s) => [s.time, s.survival, s.at_risk, s.events, s.censored])).toEqual([
      [24, 0.75, 4, 1, 0],
      [50, 0.5, 3, 1, 0],
      [90, 0.5, 2, 0, 1],
      [104, 0.5, 1, 0, 1],
    ]);
  });

  it("splits the curve by severity, with no median where survival stays above one half", () => {
    expect(results.exposure_survival.by_severity.map((g) => [g.key, g.n, g.fixed, g.censored, g.median_days])).toEqual([
      ["CRITICAL", 1, 1, 0, 24],
      ["MEDIUM", 3, 1, 2, null],
    ]);
  });

  it("reports the share of fixes only dated to a snapshot interval", () => {
    expect(results.exposure_survival.snapshot_precision_share).toBe(1);
  });

  it("censors at the start date while the experiment has not ended yet", () => {
    const { exposure_survival } = aggregateExperimentResults(
      input([entry("e3", ["P", "P", "P", "P"], DATES)], null),
    );
    expect(exposure_survival.censored_at).toBe("2025-04-11");
    expect(exposure_survival.overall.curve).toEqual([
      { time: 100, survival: 1, at_risk: 1, events: 0, censored: 1 },
    ]);
  });

  it("is empty without exposures", () => {
    const { exposure_survival } = aggregateExperimentResults(input([]));
    expect(exposure_survival.overall).toEqual({
      key: "all",
      n: 0,
      fixed: 0,
      censored: 0,
      median_days: null,
      curve: [],
    });
    expect(exposure_survival.by_severity).toEqual([]);
    expect(exposure_survival.snapshot_precision_share).toBeNull();
  });
});
