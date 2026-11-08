import { lt } from "semver";

import { deriveExposures, planProbes } from "./experiment-exposures";
import {
  aggregateExperimentResults,
  type ExperimentResultsInput,
  type ResultsProbeAnalysisInput,
  type ResultsProbeInput,
  type ResultsProbeIntervalInput,
  type ResultsRunInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";
import { NO_LOCKFILE_YET } from "./experiment-row-copy";

// Scenarios and expected outcomes come from the exposure timeline prototype
// (spec #30, phase 2). A small world of commits becomes the rows the
// platform stores: runs per grid date, instances, probe outcome rows of the
// snapshot and probed commits, the listed intervals and failed probes.

interface Change {
  pkg: string;
  /** null removes the package from the workspace */
  version: string | null;
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
  probe_intervals: ResultsProbeIntervalInput[];
  probe_analyses: ResultsProbeAnalysisInput[];
}

interface WorldOptions {
  /** Commits whose snapshot analysis fails */
  failing?: string[];
  /** Commits a probe already analysed */
  probed?: string[];
  /** Commits whose probe analysis failed, with the reason */
  probeFailed?: Record<string, string>;
  /** Commits whose probe is still in flight */
  probing?: string[];
  /** List the intervals between snapshot commits (default true) */
  listed?: boolean;
}

type Workspaces = Record<string, Record<string, { version: string; direct: boolean }>>;

const committedAt = (commit: Commit): Date => new Date(`${commit.date}T12:00:00Z`);

/** The rows one dataset entry's snapshots and probes would leave behind. */
function world(entry: string, commits: Commit[], vulns: Vuln[] = [LODASH], options: WorldOptions = {}): WorldRows {
  const { failing = [], probed = [], probeFailed = {}, probing = [], listed = true } = options;
  const states: Workspaces[] = [];
  let ws: Workspaces = {};
  for (const commit of commits) {
    ws = structuredClone(ws);
    for (const change of commit.changes) {
      const name = change.ws ?? ".";
      ws[name] ??= {};
      if (change.version === null) delete ws[name][change.pkg];
      else ws[name][change.pkg] = { version: change.version, direct: !change.parent };
    }
    states.push(ws);
  }
  const hasLockfile = (index: number): boolean => commits.slice(0, index + 1).some((c) => c.changes.length > 0);
  const packagesOf = (index: number): ResultsProbeInput["packages"] =>
    hasLockfile(index)
      ? Object.entries(states[index]!).flatMap(([workspace, pkgs]) =>
          Object.entries(pkgs).map(([name, p]) => ({ workspace, name, version: p.version, direct: p.direct })),
        )
      : [];

  const rows: WorldRows = { runs: [], vulnerabilities: [], probes: [], probe_intervals: [], probe_analyses: [] };
  const owners = new Map<string, string>();
  const pinned: (number | null)[] = [];
  GRID.forEach((gridDate, gridIndex) => {
    const id = `${entry}-${gridIndex}`;
    let index = -1;
    commits.forEach((commit, i) => {
      if (gridDate === null || commit.date <= gridDate) index = i;
    });
    pinned.push(index >= 0 ? index : null);
    const commit = commits[index];
    const base = {
      dataset_entry_id: entry,
      grid_index: gridIndex,
      grid_date: gridDate === null ? null : new Date(`${gridDate}T00:00:00Z`),
      commit_hash: commit?.sha ?? null,
      committed_at: commit ? committedAt(commit) : null,
    };
    if (!commit) {
      rows.runs.push({ ...base, status: "done", error: NO_LOCKFILE_YET, rows_run_id: id });
      return;
    }
    const owner = owners.get(commit.sha);
    let status = "done";
    let error: string | null = null;
    if (failing.includes(commit.sha)) {
      status = "failed";
      error = "analysis failed";
    } else if (!hasLockfile(index)) error = NO_LOCKFILE_YET;
    rows.runs.push({ ...base, status, error, rows_run_id: owner ?? id });
    if (owner || status !== "done") return;
    owners.set(commit.sha, id);
    rows.probes.push({ dataset_entry_id: entry, commit_hash: commit.sha, packages: packagesOf(index) });
    for (const [workspace, pkgs] of Object.entries(error ? {} : states[index]!)) {
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
          vulnerable_versions: { ranges: [{ introduced: null, fixed: vuln.fixed }], exact: [], universal: false },
        });
      }
    }
  });

  commits.forEach((commit, index) => {
    if (probed.includes(commit.sha)) {
      rows.probes.push({ dataset_entry_id: entry, commit_hash: commit.sha, packages: packagesOf(index) });
      rows.probe_analyses.push({ dataset_entry_id: entry, commit_hash: commit.sha, status: "done", error: null });
    }
    const reason = probeFailed[commit.sha];
    if (reason) rows.probe_analyses.push({ dataset_entry_id: entry, commit_hash: commit.sha, status: "failed", error: reason });
    if (probing.includes(commit.sha)) {
      rows.probe_analyses.push({ dataset_entry_id: entry, commit_hash: commit.sha, status: "pending", error: null });
    }
  });

  if (listed) {
    // Every pair of distinct snapshot commits, as the runner would list them
    const seen = new Set<string>();
    for (const lo of [null, ...pinned]) {
      for (const hi of pinned) {
        if (hi === null || (lo !== null && lo >= hi)) continue;
        const key = `${lo}/${hi}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.probe_intervals.push({
          dataset_entry_id: entry,
          from_commit: lo === null ? null : commits[lo]!.sha,
          to_commit: commits[hi]!.sha,
          candidates: commits
            .slice(lo === null ? 0 : lo + 1, hi + 1)
            .filter((c) => c.changes.length > 0)
            .map((c) => ({ sha: c.sha, committed_at: committedAt(c).toISOString() })),
          error: null,
        });
      }
    }
  }
  return rows;
}

function input(...worlds: WorldRows[]): ExperimentResultsInput {
  return {
    runs: worlds.flatMap((w) => w.runs),
    summaries: [],
    vulnerabilities: worlds.flatMap((w) => w.vulnerabilities),
    probes: worlds.flatMap((w) => w.probes),
    probe_intervals: worlds.flatMap((w) => w.probe_intervals),
    probe_analyses: worlds.flatMap((w) => w.probe_analyses),
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

const bumpCommits = (): Commit[] => [
  C("a1f", "2024-11-05", ch("lodash", "4.17.15"), ch("express", "4.18.0")),
  C("b2c", "2025-01-20", ch("eslint", "8.0.0")),
  C("c3d", "2025-03-05", ch("lodash", "4.17.19")),
  C("d4e", "2025-03-14", ch("dotenv", "16.0.0")),
  C("e5f", "2025-03-20", ch("lodash", "4.17.21")),
  C("f6a", "2025-03-28", ch("zod", "3.22.0")),
  C("g7b", "2025-05-15", ch("vitest", "1.0.0")),
];
const LODASH_2: Vuln = { id: "DEMO-lodash-2", pkg: "lodash", fixed: "4.17.19", published: "2024-10-01", severity: "MEDIUM" };

describe("fix probes: dating from stored outcomes", () => {
  it("dates a fix to the probed commit where no vulnerable version remains", () => {
    const [exposure] = deriveExposures(input(world("e1", happyCommits(), [LODASH], { probed: ["d4e"] })));
    expect(exposure!.fix).toEqual({
      date: "2025-03-12",
      commit_hash: "d4e",
      precision: "commit",
      interval_from: "2025-03-01",
      interval_to: "2025-04-01",
      kind: "upgraded",
      lag_days: 30,
      probe_outcome: "found",
      probe_reason: null,
    });
  });

  it("dates two fixes in one interval from the same probes, each at its own boundary", () => {
    const exposures = deriveExposures(
      input(world("e1", bumpCommits(), [LODASH, LODASH_2], { probed: ["c3d", "d4e", "e5f"] })),
    );
    expect(exposures.map((e) => [e.vulnerability_id, e.fix?.commit_hash, e.fix?.date, e.fix?.precision, e.fix?.kind, e.fix?.lag_days])).toEqual([
      ["DEMO-lodash-1", "e5f", "2025-03-20", "commit", "upgraded", 38],
      ["DEMO-lodash-2", "c3d", "2025-03-05", "commit", "upgraded", 155],
    ]);
  });

  it("ends a search whose probe failed as not_found with the reason, at snapshot precision", () => {
    const [exposure] = deriveExposures(
      input(world("e1", happyCommits(), [LODASH], { failing: ["b2c", "e5f"], probeFailed: { d4e: "clone failed" } })),
    );
    expect(exposure!.fix).toMatchObject({
      date: "2025-05-02",
      commit_hash: "f6a",
      precision: "snapshot",
      lag_days: 81,
      probe_outcome: "not_found",
      probe_reason: "probe of d4e failed: clone failed",
    });
  });

  it("skips failed snapshots inside the interval and still finds the fix", () => {
    const [exposure] = deriveExposures(
      input(world("e1", happyCommits(), [LODASH], { failing: ["b2c", "e5f"], probed: ["d4e"] })),
    );
    expect(exposure!.fix).toMatchObject({ commit_hash: "d4e", precision: "commit", lag_days: 30, probe_outcome: "found" });
  });

  it("is not_found when no commit in the interval touched the lockfile", () => {
    const rows = world("e1", happyCommits());
    for (const interval of rows.probe_intervals) interval.candidates = [];
    const [exposure] = deriveExposures(input(rows));
    expect(exposure!.fix).toMatchObject({
      precision: "snapshot",
      probe_outcome: "not_found",
      probe_reason: "no lockfile-touching commit in the interval",
    });
  });

  it("is ambiguous when a known commit contradicts a single boundary", () => {
    // lodash fixed at c3d, reverted at d4e, fixed again at e5f: d4e reads vulnerable after the boundary
    const commits = [
      C("a1f", "2024-11-05", ch("lodash", "4.17.15")),
      C("b2c", "2025-02-20", ch("eslint", "8.0.0")),
      C("c3d", "2025-03-05", ch("lodash", "4.17.21")),
      C("d4e", "2025-03-12", ch("lodash", "4.17.15")),
      C("e5f", "2025-03-24", ch("lodash", "4.17.21")),
      C("f6a", "2025-05-02", ch("zod", "3.22.0")),
    ];
    const [exposure] = deriveExposures(input(world("e1", commits, [LODASH], { probed: ["c3d", "d4e"] })));
    expect(exposure!.fix).toMatchObject({
      precision: "snapshot",
      commit_hash: "e5f",
      probe_outcome: "ambiguous",
      probe_reason: "a known commit in the interval contradicts a single boundary",
    });
  });

  it("leaves the probe outcome empty while the search still needs a probe", () => {
    const [exposure] = deriveExposures(input(world("e1", happyCommits())));
    expect(exposure!.fix).toMatchObject({ precision: "snapshot", probe_outcome: null, probe_reason: null });
  });

  it("dates introductions too, including the first lockfile after empty snapshots", () => {
    const commits = [
      C("a1f", "2025-02-14"),
      C("b2c", "2025-03-03", ch("lodash", "4.17.15")),
      C("c3d", "2025-03-18", ch("express", "4.18.0")),
      C("d4e", "2025-05-08", ch("lodash", "4.17.21")),
      C("e5f", "2025-05-19", ch("zod", "3.22.0")),
    ];
    const [exposure] = deriveExposures(input(world("e1", commits, [LODASH], { probed: ["b2c", "d4e"] })));
    expect(exposure!.introduction).toMatchObject({
      commit_hash: "b2c",
      date: "2025-03-03",
      precision: "commit",
      residence_days: -21,
      probe_outcome: "found",
    });
    expect(exposure!.fix).toMatchObject({ commit_hash: "d4e", date: "2025-05-08", precision: "commit", lag_days: 87 });
  });

  it("dates an introduction before the first commit's snapshot from the repository's first commits", () => {
    const commits = [
      C("a1f", "2025-03-03", ch("express", "4.18.0")),
      C("b2c", "2025-03-10", ch("mkdirp", "0.5.5"), ch("lodash", "4.17.15", "mkdirp")),
      C("c3d", "2025-03-20", ch("zod", "3.22.0")),
    ];
    const [exposure] = deriveExposures(input(world("e1", commits, [LODASH], { probed: ["a1f", "b2c"] })));
    expect(exposure!.introduction).toMatchObject({ commit_hash: "b2c", precision: "commit", probe_outcome: "found" });
  });

  it("compares the states either side of the located commit for the fix kind", () => {
    // Upgraded at d4e, then dropped at e5f: the snapshots alone read a removal
    const commits = [
      C("a1f", "2024-11-05", ch("lodash", "4.17.15")),
      C("c3d", "2025-02-25", ch("express", "4.18.2")),
      C("d4e", "2025-03-12", ch("lodash", "4.17.21")),
      C("e5f", "2025-03-20", ch("lodash", null)),
      C("f6a", "2025-03-28", ch("zod", "3.22.0")),
    ];
    const snapshotOnly = deriveExposures(input(world("e1", commits, [LODASH], { listed: false })));
    expect(snapshotOnly[0]!.fix).toMatchObject({ precision: "snapshot", kind: "removed_direct" });
    const [exposure] = deriveExposures(input(world("e1", commits, [LODASH], { probed: ["d4e", "e5f"] })));
    expect(exposure!.fix).toMatchObject({ commit_hash: "d4e", precision: "commit", kind: "upgraded" });
  });

  it("tells a transitive removal at the located commit from a direct one", () => {
    const toughCookie: Vuln = { id: "DEMO-tough-cookie-1", pkg: "tough-cookie", fixed: "4.1.3", published: "2025-01-25", severity: "MEDIUM" };
    const commits = [
      C("a1f", "2024-11-05", ch("express", "4.18.0")),
      C("c3d", "2025-02-10", ch("request", "2.88.2"), ch("tough-cookie", "2.5.0", "request")),
      C("c3e", "2025-03-05", ch("pino", "8.0.0")),
      C("d4e", "2025-03-12", ch("request", null), ch("tough-cookie", null), ch("axios", "1.6.0")),
      C("e5f", "2025-03-20", ch("dotenv", "16.0.0")),
      C("f6a", "2025-03-28", ch("zod", "3.22.0")),
    ];
    // Candidates c3e, d4e, e5f, f6a: the state before d4e comes from the c3e probe
    const rows = world("e1", commits, [toughCookie], { probed: ["c3e", "d4e"] });
    const [exposure] = deriveExposures(input(rows));
    expect(exposure!.fix).toMatchObject({ commit_hash: "d4e", precision: "commit", kind: "removed_transitive" });
  });
});

describe("fix probes: planning", () => {
  it("asks to list each interval that needs dating, once", () => {
    const plan = planProbes(input(world("e1", happyCommits(), [LODASH], { listed: false })));
    expect(plan.intervals.map((i) => [i.entry, i.from.commit_hash, i.to.commit_hash])).toEqual([["e1", "c3d", "e5f"]]);
    expect(plan.probes).toEqual([]);
  });

  it("halves over the candidates and never probes the last one", () => {
    const first = planProbes(input(world("e1", bumpCommits(), [LODASH])));
    // Candidates c3d, d4e, e5f, f6a: d4e is still vulnerable, so e5f next
    expect(first.probes.map((p) => p.commit.sha)).toEqual(["d4e"]);
    const second = planProbes(input(world("e1", bumpCommits(), [LODASH], { probed: ["d4e"] })));
    expect(second.probes.map((p) => p.commit.sha)).toEqual(["e5f"]);
    const done = planProbes(input(world("e1", bumpCommits(), [LODASH], { probed: ["d4e", "e5f"] })));
    expect(done).toEqual({ intervals: [], probes: [], waiting: 0 });
  });

  it("asks for one probe of a commit however many events need it", () => {
    const plan = planProbes(input(world("e1", bumpCommits(), [LODASH, LODASH_2])));
    expect(plan.probes.map((p) => p.commit.sha)).toEqual(["d4e"]);
  });

  it("needs no probe for a single candidate, nor for commits already known", () => {
    const plan = planProbes(input(world("e1", happyCommits(), [LODASH], { probed: ["d4e"] })));
    expect(plan.probes).toEqual([]);
  });

  it("waits for a probe in flight instead of asking again", () => {
    const plan = planProbes(input(world("e1", bumpCommits(), [LODASH], { probing: ["d4e"] })));
    expect(plan).toEqual({ intervals: [], probes: [], waiting: 1 });
  });

  it("plans fixes before introductions, each oldest first, across entries", () => {
    const reintro = [
      C("a1f", "2024-11-05", ch("lodash", "4.17.15"), ch("express", "4.18.0")),
      C("b2c", "2025-01-20", ch("eslint", "8.0.0")),
      C("c3d", "2025-02-25", ch("express", "4.18.2")),
      C("d4e", "2025-03-12", ch("lodash", "4.17.21")),
      C("d5e", "2025-03-20", ch("pino", "8.0.0")),
      C("e5f", "2025-03-28", ch("dotenv", "16.0.0")),
      C("h8c", "2025-05-10", ch("lodash", "4.17.15")),
      C("h9c", "2025-05-15", ch("vite", "5.0.0")),
      C("i9d", "2025-05-20", ch("pino", "8.1.0")),
    ];
    const late = [
      C("a1f", "2024-11-05", ch("lodash", "4.17.15")),
      C("k1a", "2025-01-10", ch("pino", "8.0.0")),
      C("k2b", "2025-01-15", ch("lodash", "4.17.21")),
      C("k3c", "2025-01-25", ch("vite", "5.0.0")),
    ];
    const plan = planProbes(input(world("e1", reintro), world("e2", late)));
    expect(plan.probes.map((p) => [p.entry, p.commit.sha])).toEqual([
      ["e2", "k1a"],
      ["e1", "d4e"],
      ["e1", "h8c"],
    ]);
  });

  it("waits for every snapshot of an entry before planning its probes", () => {
    const rows = world("e1", happyCommits(), [LODASH], { listed: false });
    rows.runs[rows.runs.length - 1]!.status = "pending";
    expect(planProbes(input(rows))).toEqual({ intervals: [], probes: [], waiting: 0 });
  });
});

describe("fix probes in the results", () => {
  const introCommits = [
    C("a1f", "2025-02-14"),
    C("b2c", "2025-03-03", ch("lodash", "4.17.15")),
    C("c3d", "2025-03-18", ch("express", "4.18.0")),
    C("d4e", "2025-05-08", ch("lodash", "4.17.21")),
    C("e5f", "2025-05-19", ch("zod", "3.22.0")),
  ];
  const results = aggregateExperimentResults(
    input(
      world("e1", happyCommits(), [LODASH], { probed: ["d4e"] }),
      world("e2", happyCommits(), [LODASH], { failing: ["b2c", "e5f"], probeFailed: { d4e: "clone failed" } }),
      world("e3", happyCommits(), [LODASH], { listed: false }),
      world("e4", introCommits, [LODASH], { probed: ["b2c", "d4e"] }),
    ),
  );

  it("pools commit- and snapshot-precision fixes, reporting the share of each", () => {
    expect(results.fix_lag.fixes).toBe(4);
    expect(results.fix_lag.snapshot_precision_share).toBe(0.5);
    expect(results.fix_lag.overall).toMatchObject({ n: 4, median: 63.5, min: 30, max: 87 });
    expect(results.exposures.fix_precision).toEqual({ commit: 2, snapshot: 2 });
    expect(results.exposures.introduction_precision).toEqual({ commit: 1, snapshot: 0 });
  });

  it("counts probe outcomes for fixes and introductions, with the reasons nothing was found", () => {
    expect(results.probes).toEqual({
      fixes: { found: 2, ambiguous: 0, not_found: 1, not_probed: 1 },
      introductions: { found: 1, ambiguous: 0, not_found: 0, not_probed: 0 },
      not_found_reasons: { "probe of d4e failed: clone failed": 1 },
      budget: { analysis_budget: null, analyses_submitted: null, spent: false },
    });
  });
});

describe("fix probes under an analysis budget", () => {
  const spent = { analysis_budget: 5, analyses_submitted: 5 };

  it("reports events a spent budget left unprobed as not_found, budget spent, at snapshot precision", () => {
    const rows = { ...input(world("e1", bumpCommits(), [LODASH, LODASH_2], { probed: ["d4e"] })), budget: spent };
    expect(deriveExposures(rows).map((e) => [e.vulnerability_id, e.fix])).toEqual([
      ["DEMO-lodash-1", expect.objectContaining({ commit_hash: "f6a", date: "2025-03-28", precision: "snapshot", probe_outcome: "not_found", probe_reason: "budget spent" })],
      ["DEMO-lodash-2", expect.objectContaining({ commit_hash: "f6a", date: "2025-03-28", precision: "snapshot", probe_outcome: "not_found", probe_reason: "budget spent" })],
    ]);
  });

  it("still dates events that need no further probe once the budget is spent", () => {
    const rows = { ...input(world("e1", happyCommits(), [LODASH], { probed: ["d4e"] })), budget: spent };
    const [exposure] = deriveExposures(rows);
    expect(exposure!.fix).toMatchObject({ commit_hash: "d4e", precision: "commit", probe_outcome: "found" });
  });

  it("leaves events unfinished while the budget has analyses left", () => {
    const rows = {
      ...input(world("e1", bumpCommits(), [LODASH], { probed: ["d4e"] })),
      budget: { analysis_budget: 6, analyses_submitted: 5 },
    };
    const [exposure] = deriveExposures(rows);
    expect(exposure!.fix).toMatchObject({ precision: "snapshot", probe_outcome: null, probe_reason: null });
  });

  it("reports the budget and what it left unprobed in the probes block", () => {
    const results = aggregateExperimentResults({
      ...input(world("e1", bumpCommits(), [LODASH, LODASH_2], { probed: ["d4e"] })),
      budget: spent,
    });
    expect(results.probes).toEqual({
      fixes: { found: 0, ambiguous: 0, not_found: 2, not_probed: 0 },
      introductions: { found: 0, ambiguous: 0, not_found: 0, not_probed: 0 },
      not_found_reasons: { "budget spent": 2 },
      budget: { analysis_budget: 5, analyses_submitted: 5, spent: true },
    });
  });

  it("reports no budget for an experiment created without one", () => {
    const results = aggregateExperimentResults(input(world("e1", happyCommits(), [LODASH], { probed: ["d4e"] })));
    expect(results.probes.budget).toEqual({ analysis_budget: null, analyses_submitted: null, spent: false });
  });
});
