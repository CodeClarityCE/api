import { lt } from "semver";

import { deriveExposures } from "./experiment-exposures";
import {
  aggregateExperimentResults,
  type ExperimentResultsInput,
  type ResultsProbeInput,
  type ResultsRunInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";
import { NO_LOCKFILE_YET } from "./experiment-row-copy";

// Scenarios and expected outcomes come from the exposure timeline prototype
// (spec #30). A small world of commits is turned into the rows the platform
// would store: one run per grid date, instances and probe outcome rows.

interface Change {
  pkg: string;
  /** null removes the package from the workspace */
  version: string | null;
  /** Set when the package arrives through another one */
  parent?: string;
  ws?: string;
}

interface Commit {
  sha: string;
  date: string;
  changes: Change[];
}

interface Vuln {
  id: string;
  pkg: string;
  fixed: string;
  published: string;
  severity: string;
}

const ch = (pkg: string, version: string | null, parent?: string, ws?: string): Change => ({
  pkg,
  version,
  ...(parent ? { parent } : {}),
  ...(ws ? { ws } : {}),
});
const C = (sha: string, date: string, ...changes: Change[]): Commit => ({ sha, date, changes });

const LODASH: Vuln = {
  id: "DEMO-lodash-1",
  pkg: "lodash",
  fixed: "4.17.21",
  published: "2025-02-10T08:00:00Z",
  severity: "HIGH",
};

/** Monthly grid from 2025-01-01, six dates, then HEAD. */
const GRID = ["2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01", null];

interface WorldRows {
  runs: ResultsRunInput[];
  vulnerabilities: ResultsVulnerabilityInput[];
  probes: ResultsProbeInput[];
}

type Workspaces = Record<string, Record<string, { version: string; direct: boolean }>>;

/** The rows one dataset entry's snapshots would leave behind. */
function world(
  entry: string,
  commits: Commit[],
  vulns: Vuln[] = [LODASH],
  failing: string[] = [],
): WorldRows {
  const states: { lockfile: boolean; ws: Workspaces }[] = [];
  let ws: Workspaces = {};
  let lockfile = false;
  for (const commit of commits) {
    if (commit.changes.length) lockfile = true;
    ws = structuredClone(ws);
    for (const change of commit.changes) {
      const name = change.ws ?? ".";
      ws[name] ??= {};
      if (change.version === null) delete ws[name][change.pkg];
      else ws[name][change.pkg] = { version: change.version, direct: !change.parent };
    }
    states.push({ lockfile, ws });
  }

  const rows: WorldRows = { runs: [], vulnerabilities: [], probes: [] };
  const owners = new Map<string, string>();
  GRID.forEach((gridDate, gridIndex) => {
    const id = `${entry}-${gridIndex}`;
    let index = -1;
    commits.forEach((commit, i) => {
      if (gridDate === null || commit.date <= gridDate) index = i;
    });
    const commit = commits[index];
    const base = {
      dataset_entry_id: entry,
      grid_index: gridIndex,
      grid_date: gridDate === null ? null : new Date(`${gridDate}T00:00:00Z`),
      commit_hash: commit?.sha ?? null,
      committed_at: commit ? new Date(`${commit.date}T12:00:00Z`) : null,
    };
    if (!commit) {
      rows.runs.push({ ...base, status: "done", error: NO_LOCKFILE_YET, rows_run_id: id });
      return;
    }
    const owner = owners.get(commit.sha);
    const state = states[index]!;
    let status = "done";
    let error: string | null = null;
    if (failing.includes(commit.sha)) {
      status = "failed";
      error = "analysis failed";
    } else if (!state.lockfile) error = NO_LOCKFILE_YET;
    rows.runs.push({ ...base, status, error, rows_run_id: owner ?? id });
    if (owner || status !== "done") return;
    owners.set(commit.sha, id);

    rows.probes.push({
      dataset_entry_id: entry,
      commit_hash: commit.sha,
      packages: Object.entries(state.ws).flatMap(([workspace, pkgs]) =>
        Object.entries(pkgs).map(([name, p]) => ({ workspace, name, version: p.version, direct: p.direct })),
      ),
    });
    for (const [workspace, pkgs] of Object.entries(state.ws)) {
      for (const vuln of vulns) {
        const p = pkgs[vuln.pkg];
        if (!p || !lt(p.version, vuln.fixed)) continue;
        rows.vulnerabilities.push({
          run_id: id,
          workspace,
          vulnerability_id: vuln.id,
          affected_dependency: vuln.pkg,
          affected_version: p.version,
          direct_dependency: p.direct,
          severity_class: vuln.severity,
          published_date: vuln.published,
          epss_score: null,
          conflict_flag: "MATCH_CORRECT",
          winning_source: "OSV",
          withdrawn_date: null,
        });
      }
    }
  });
  return rows;
}

function input(...worlds: WorldRows[]): ExperimentResultsInput {
  return {
    runs: worlds.flatMap((w) => w.runs),
    summaries: [],
    vulnerabilities: worlds.flatMap((w) => w.vulnerabilities),
    probes: worlds.flatMap((w) => w.probes),
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

const happyCommits = (): Commit[] => [
  C("a1f", "2024-11-05", ch("lodash", "4.17.15"), ch("express", "4.18.0")),
  C("b2c", "2025-01-20", ch("eslint", "8.0.0")),
  C("c3d", "2025-02-25", ch("express", "4.18.2")),
  C("d4e", "2025-03-12", ch("lodash", "4.17.21")),
  C("e5f", "2025-03-28", ch("dotenv", "16.0.0")),
  C("f6a", "2025-05-02"),
  C("g7b", "2025-06-20", ch("zod", "3.22.0")),
];

describe("exposures", () => {
  it("dates a fix to the later bracketing snapshot's commit, with no introduction before the grid", () => {
    const exposures = deriveExposures(input(world("e1", happyCommits())));
    expect(exposures).toEqual([
      {
        dataset_entry_id: "e1",
        vulnerability_id: "DEMO-lodash-1",
        affected_dependency: "lodash",
        severity: "HIGH",
        published_date: "2025-02-10",
        first_present: "2025-01-01",
        last_present: "2025-03-01",
        gaps: 0,
        open: false,
        introduction: null,
        fix: {
          date: "2025-03-28",
          commit_hash: "e5f",
          precision: "snapshot",
          interval_from: "2025-03-01",
          interval_to: "2025-04-01",
          kind: "upgraded",
          lag_days: 46,
        },
      },
    ]);
  });

  it("continues an exposure through a bump that stays vulnerable and ends the one it fixes", () => {
    const lodash2: Vuln = { id: "DEMO-lodash-2", pkg: "lodash", fixed: "4.17.19", published: "2024-10-01", severity: "MEDIUM" };
    const exposures = deriveExposures(
      input(
        world(
          "e1",
          [
            C("a1f", "2024-11-05", ch("lodash", "4.17.15"), ch("express", "4.18.0")),
            C("b2c", "2025-01-20", ch("eslint", "8.0.0")),
            C("c3d", "2025-03-05", ch("lodash", "4.17.19")),
            C("d4e", "2025-03-14", ch("dotenv", "16.0.0")),
            C("e5f", "2025-03-20", ch("lodash", "4.17.21")),
            C("f6a", "2025-03-28", ch("zod", "3.22.0")),
            C("g7b", "2025-05-15", ch("vitest", "1.0.0")),
          ],
          [LODASH, lodash2],
        ),
      ),
    );
    expect(exposures.map((e) => [e.vulnerability_id, e.introduction, e.fix?.date, e.fix?.kind, e.fix?.lag_days])).toEqual([
      ["DEMO-lodash-1", null, "2025-03-28", "upgraded", 46],
      ["DEMO-lodash-2", null, "2025-03-28", "upgraded", 178],
    ]);
  });

  it("starts a new exposure on a reintroduction, open at HEAD", () => {
    const commits = [
      ...happyCommits().slice(0, 6),
      C("h8c", "2025-05-10", ch("lodash", "4.17.15")),
      C("i9d", "2025-05-20", ch("pino", "8.0.0")),
      C("g7b", "2025-06-20", ch("zod", "3.22.0")),
    ];
    const [first, second] = deriveExposures(input(world("e1", commits)));
    expect(first).toMatchObject({ open: false, introduction: null, fix: { date: "2025-03-28", lag_days: 46 } });
    expect(second).toMatchObject({
      first_present: "2025-06-01",
      last_present: null,
      open: true,
      fix: null,
      introduction: {
        date: "2025-05-20",
        commit_hash: "i9d",
        precision: "snapshot",
        interval_from: "2025-05-01",
        interval_to: "2025-06-01",
        residence_days: -99,
      },
    });
  });

  it("keeps an exposure open while any workspace is vulnerable, and calls it upgraded if a safe version remains", () => {
    const web = "packages/web";
    const api = "packages/api";
    const rows = world("e1", [
      C("a1f", "2024-11-05", ch("lodash", "4.17.15", undefined, web), ch("lodash", "4.17.15", undefined, api), ch("express", "4.18.0", undefined, api)),
      C("b2c", "2025-01-20", ch("vite", "5.0.0", undefined, web)),
      C("c3d", "2025-02-18", ch("lodash", "4.17.21", undefined, web)),
      C("d4e", "2025-03-10", ch("zod", "3.22.0", undefined, api)),
      C("e5f", "2025-04-14", ch("lodash", null, undefined, api)),
      C("f6a", "2025-04-25", ch("pinia", "2.1.0", undefined, web)),
      C("g7b", "2025-06-02", ch("pino", "8.0.0", undefined, api)),
    ]);
    const exposures = deriveExposures(input(rows));
    expect(exposures).toHaveLength(1);
    expect(exposures[0]!.fix).toMatchObject({ date: "2025-04-25", kind: "upgraded", lag_days: 74 });
  });

  it("skips failed snapshots as gaps without ending the exposure", () => {
    const [exposure] = deriveExposures(input(world("e1", happyCommits(), [LODASH], ["b2c", "e5f"])));
    expect(exposure).toMatchObject({
      gaps: 3,
      introduction: null,
      fix: { date: "2025-05-02", interval_from: "2025-03-01", interval_to: "2025-06-01", lag_days: 81 },
    });
  });

  it("leaves an exposure present at HEAD open, with its pre-disclosure residence", () => {
    const minimist: Vuln = { id: "DEMO-minimist-1", pkg: "minimist", fixed: "1.2.6", published: "2025-05-20", severity: "CRITICAL" };
    const exposures = deriveExposures(
      input(
        world(
          "e1",
          [
            C("a1f", "2024-11-05", ch("express", "4.18.0")),
            C("b2c", "2025-01-20", ch("eslint", "8.0.0")),
            C("c3d", "2025-02-06", ch("mkdirp", "0.5.5"), ch("minimist", "1.2.5", "mkdirp")),
            C("d4e", "2025-02-21", ch("dotenv", "16.0.0")),
            C("e5f", "2025-04-03", ch("zod", "3.22.0")),
            C("f6a", "2025-06-11", ch("vitest", "1.0.0")),
          ],
          [minimist],
        ),
      ),
    );
    expect(exposures).toEqual([
      expect.objectContaining({
        severity: "CRITICAL",
        open: true,
        fix: null,
        introduction: expect.objectContaining({ date: "2025-02-21", residence_days: 88 }),
      }),
    ]);
  });

  it("counts a first appearance after empty pre-lockfile snapshots as an introduction", () => {
    const [exposure] = deriveExposures(
      input(
        world("e1", [
          C("a1f", "2025-02-14"),
          C("b2c", "2025-03-03", ch("lodash", "4.17.15"), ch("express", "4.18.0")),
          C("c3d", "2025-03-20", ch("eslint", "8.0.0")),
          C("d4e", "2025-05-08", ch("lodash", "4.17.21")),
          C("e5f", "2025-05-19", ch("zod", "3.22.0")),
        ]),
      ),
    );
    expect(exposure).toMatchObject({
      introduction: { date: "2025-03-20", interval_from: "2025-03-01", interval_to: "2025-04-01", residence_days: -38 },
      fix: { date: "2025-05-19", kind: "upgraded", lag_days: 98 },
    });
  });

  it("tells a direct removal from a transitive one", () => {
    const toughCookie: Vuln = { id: "DEMO-tough-cookie-1", pkg: "tough-cookie", fixed: "4.1.3", published: "2025-01-25", severity: "MEDIUM" };
    const moment: Vuln = { id: "DEMO-moment-1", pkg: "moment", fixed: "2.29.4", published: "2024-12-01", severity: "HIGH" };
    const exposures = deriveExposures(
      input(
        world(
          "e1",
          [
            C("a1f", "2024-11-05", ch("request", "2.88.2"), ch("tough-cookie", "2.5.0", "request"), ch("moment", "2.29.1"), ch("express", "4.18.0")),
            C("b2c", "2025-01-20", ch("eslint", "8.0.0")),
            C("c3d", "2025-02-27", ch("request", null), ch("tough-cookie", null), ch("axios", "1.6.0")),
            C("d4e", "2025-03-15", ch("moment", null), ch("date-fns", "3.0.0")),
            C("e5f", "2025-03-25", ch("zod", "3.22.0")),
            C("f6a", "2025-05-30", ch("vitest", "1.0.0")),
          ],
          [toughCookie, moment],
        ),
      ),
    );
    expect(exposures.map((e) => [e.affected_dependency, e.fix?.kind, e.fix?.lag_days])).toEqual([
      ["moment", "removed_direct", 114],
      ["tough-cookie", "removed_transitive", 33],
    ]);
  });

  it("leaves the fix kind unknown when the state after the fix has no probe outcome row", () => {
    const rows = world("e1", happyCommits());
    const [exposure] = deriveExposures(input({ ...rows, probes: [] }));
    expect(exposure!.fix).toMatchObject({ date: "2025-03-28", kind: null });
  });
});

describe("fix lag and exposure counts in the results", () => {
  const toughCookie: Vuln = { id: "DEMO-tough-cookie-1", pkg: "tough-cookie", fixed: "4.1.3", published: "2025-01-25", severity: "MEDIUM" };
  const moment: Vuln = { id: "DEMO-moment-1", pkg: "moment", fixed: "2.29.4", published: "2024-12-01", severity: "HIGH" };
  const silent: Vuln = { id: "DEMO-lodash-3", pkg: "lodash", fixed: "4.17.21", published: "2025-04-10", severity: "LOW" };
  const results = aggregateExperimentResults(
    input(
      world("e1", happyCommits()),
      world(
        "e2",
        [
          C("a1f", "2024-11-05", ch("request", "2.88.2"), ch("tough-cookie", "2.5.0", "request"), ch("moment", "2.29.1")),
          C("c3d", "2025-02-27", ch("request", null), ch("tough-cookie", null), ch("axios", "1.6.0")),
          C("d4e", "2025-03-15", ch("moment", null)),
          C("e5f", "2025-03-25", ch("zod", "3.22.0")),
        ],
        [toughCookie, moment],
      ),
      world("e3", happyCommits(), [silent]),
      world("e4", [C("a1f", "2025-02-06", ch("lodash", "4.17.15"))]),
    ),
  );

  it("summarises fix lag by severity and by fix kind, counting fixes before disclosure", () => {
    expect(results.fix_lag.fixes).toBe(4);
    expect(results.fix_lag.snapshot_precision_share).toBe(1);
    expect(results.fix_lag.overall).toEqual({ n: 4, median: 39.5, p25: 21.5, p75: 63, min: -13, max: 114, before_disclosure: 1 });
    expect(results.fix_lag.by_severity).toEqual([
      { key: "HIGH", n: 2, median: 80, p25: 63, p75: 97, min: 46, max: 114, before_disclosure: 0 },
      { key: "MEDIUM", n: 1, median: 33, p25: 33, p75: 33, min: 33, max: 33, before_disclosure: 0 },
      { key: "LOW", n: 1, median: -13, p25: -13, p75: -13, min: -13, max: -13, before_disclosure: 1 },
    ]);
    expect(results.fix_lag.by_kind.map((g) => [g.key, g.n, g.median])).toEqual([
      ["upgraded", 2, 16.5],
      ["removed_direct", 1, 114],
      ["removed_transitive", 1, 33],
    ]);
    expect(results.fix_lag.points).toContainEqual({ severity: "LOW", kind: "upgraded", lag_days: -13, precision: "snapshot" });
  });

  it("counts exposures, open ones, introductions and dating precision", () => {
    expect(results.exposures).toEqual({
      exposures: 5,
      open: 1,
      fixed: 4,
      introductions: 1,
      present_at_first_observation: 4,
      fix_precision: { commit: 0, snapshot: 4 },
      introduction_precision: { commit: 0, snapshot: 1 },
    });
  });

  it("has empty fix lag groups without fixes", () => {
    const { fix_lag } = aggregateExperimentResults(input());
    expect(fix_lag).toEqual({
      fixes: 0,
      snapshot_precision_share: null,
      overall: { n: 0, median: null, p25: null, p75: null, min: null, max: null, before_disclosure: 0 },
      by_severity: [],
      by_kind: [],
      points: [],
    });
  });
});
