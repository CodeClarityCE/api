import { publishedDay } from "./experiment-grid";
import { loadOverTime } from "./experiment-load";
import type { ResultsRunInput, ResultsVulnerabilityInput } from "./experiment-results";
import { NO_LOCKFILE_YET } from "./experiment-row-copy";

describe("publishedDay", () => {
  it.each([
    ["2023-07-28T04:37:03.018Z", "2023-07-28"],
    ["2022-05-17T00:01:45Z", "2022-05-17"],
    ["2022-04-06T17:15:08.650", "2022-04-06"],
    ["2022-04-06", "2022-04-06"],
    ["2022-04-06 17:15:08", "2022-04-06"],
    ["  2022-04-06T17:15:08Z  ", "2022-04-06"],
    ["2025-02-10T23:30:00-05:00", "2025-02-11"],
    ["2025-02-10T01:00:00+0200", "2025-02-09"],
    ["Mon, 10 Feb 2025 08:00:00 GMT", "2025-02-10"],
  ])("reads %j as %s", (value, day) => {
    expect(publishedDay(value)).toBe(day);
  });

  it.each([null, undefined, "", "   ", "unknown", "2025-13-45", "2025-02-30T00:00:00Z"])(
    "has no day for %j",
    (value) => {
      expect(publishedDay(value)).toBeNull();
    },
  );
});

const MID_GRID = "2025-02-15T10:00:00Z";

function run(
  id: string,
  gridDate: string | null,
  fields: Partial<ResultsRunInput> = {},
): ResultsRunInput {
  return {
    status: "done",
    error: null,
    grid_date: gridDate ? new Date(`${gridDate}T00:00:00Z`) : null,
    rows_run_id: id,
    ...fields,
  };
}

function instance(
  runId: string,
  published: string | null,
  fields: Partial<ResultsVulnerabilityInput> = {},
): ResultsVulnerabilityInput {
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
    ...fields,
  };
}

const NOW = new Date("2026-01-01T00:00:00Z");

describe("loadOverTime", () => {
  it("drops an advisory published mid-grid from the as-of view until its grid date passes", () => {
    const rows = loadOverTime({
      runs: [run("a1", "2025-01-01"), run("a2", "2025-02-01"), run("a3", "2025-03-01"), run("a4", null)],
      vulnerabilities: [
        instance("a1", MID_GRID),
        instance("a1", "2024-06-01T00:00:00Z", { vulnerability_id: "GHSA-old" }),
        instance("a2", MID_GRID),
        instance("a3", MID_GRID),
        instance("a4", MID_GRID),
      ],
      head_cutoff: new Date("2025-04-02T09:00:00Z"),
    });

    expect(rows).toEqual([
      { grid_date: "2025-01-01", as_of_date: "2025-01-01", projects: 1, hindsight: 2, as_of: 1, undated: 0 },
      { grid_date: "2025-02-01", as_of_date: "2025-02-01", projects: 1, hindsight: 1, as_of: 0, undated: 0 },
      { grid_date: "2025-03-01", as_of_date: "2025-03-01", projects: 1, hindsight: 1, as_of: 1, undated: 0 },
      { grid_date: null, as_of_date: "2025-04-02", projects: 1, hindsight: 1, as_of: 1, undated: 0 },
    ]);
  });

  it("keeps an advisory published on the grid date itself", () => {
    const [row] = loadOverTime({
      runs: [run("a1", "2025-02-15")],
      vulnerabilities: [instance("a1", MID_GRID)],
      head_cutoff: NOW,
    });

    expect(row).toMatchObject({ hindsight: 1, as_of: 1 });
  });

  it("filters HEAD by its cutoff day", () => {
    const [row] = loadOverTime({
      runs: [run("h", null)],
      vulnerabilities: [instance("h", "2025-05-01T00:00:00Z"), instance("h", "2025-05-03T00:00:00Z")],
      head_cutoff: new Date("2025-05-02T23:59:00Z"),
    });

    expect(row).toEqual({
      grid_date: null,
      as_of_date: "2025-05-02",
      projects: 1,
      hindsight: 2,
      as_of: 1,
      undated: 0,
    });
  });

  it("keeps instances with an unreadable published date in the as-of view and counts them", () => {
    const [row] = loadOverTime({
      runs: [run("a1", "2025-01-01")],
      vulnerabilities: [instance("a1", null), instance("a1", "not a date"), instance("a1", MID_GRID)],
      head_cutoff: NOW,
    });

    expect(row).toMatchObject({ hindsight: 3, as_of: 2, undated: 2 });
  });

  it("sums entries per grid date, counts empty snapshots as projects with no load, and nulls dates without a done snapshot", () => {
    const rows = loadOverTime({
      runs: [
        run("a1", "2025-01-01"),
        run("b1", "2025-01-01", { error: NO_LOCKFILE_YET }),
        run("c1", "2025-01-01", { status: "failed", error: "boom" }),
        run("a2", "2025-02-01", { status: "failed", error: "boom" }),
        run("b2", "2025-02-01", { status: "pending" }),
      ],
      vulnerabilities: [
        instance("a1", "2024-01-01"),
        instance("a1", "2024-01-01", { workspace: "packages/api" }),
        instance("b1", "2024-01-01"),
        instance("c1", "2024-01-01"),
      ],
      head_cutoff: NOW,
    });

    expect(rows).toEqual([
      { grid_date: "2025-01-01", as_of_date: "2025-01-01", projects: 2, hindsight: 2, as_of: 2, undated: 0 },
      { grid_date: "2025-02-01", as_of_date: "2025-02-01", projects: 0, hindsight: null, as_of: null, undated: 0 },
    ]);
  });

  it("reads a shared snapshot's rows from the run that owns its commit", () => {
    const rows = loadOverTime({
      runs: [run("a1", "2025-01-01"), run("a2", "2025-03-01", { rows_run_id: "a1" })],
      vulnerabilities: [instance("a1", MID_GRID)],
      head_cutoff: NOW,
    });

    expect(rows.map((r) => [r.hindsight, r.as_of])).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });

  it("ignores instances without an affected package, as the headline does", () => {
    const [row] = loadOverTime({
      runs: [run("a1", "2025-01-01")],
      vulnerabilities: [instance("a1", "2024-01-01", { affected_dependency: null })],
      head_cutoff: NOW,
    });

    expect(row).toMatchObject({ hindsight: 0, as_of: 0 });
  });
});
