/**
 * Builds the grid parity fixture (spec #30, ticket #41) from the archived
 * js-vuln-study top100 study: every snapshot of its 40-date grid plus HEAD,
 * copied through the same row copy as the runner, with the probe outcome
 * rows the archive's lockfile mining left behind.
 *
 * Per dataset entry (one JSON line each):
 * - runs: one per grid date and HEAD. Done manifest rows carry their copied
 *   instances and run summary; failed rows are failed runs; grid dates the
 *   manifest has no row for (before the repo existed) are done and empty
 *   with reason no_lockfile_yet, as the runner records them.
 * - snapshot probe outcome rows: mapProbePackages of each done snapshot's
 *   js-sbom result, kept to the packages some instance of the entry names.
 * - probe rows from mining_cache: the lockfile-touching commits of each
 *   mined window (probe intervals) and the root lockfiles parsed at the
 *   commits the archive fetched (probe outcome rows; a commit whose lockfile
 *   would not parse is a failed probe analysis).
 * The last line holds what the test compares with: the grid blocks of
 * results_numbers.json and the mining results (remediation_events).
 *
 * The raw results are about 60 GB, so they are parsed one file at a time
 * (hours, mostly disk reads). The output is 3.8 MB of Brotli, under the
 * 5 MB commit limit. --recompact rewrites an existing fixture after a trim
 * change without rereading the raw results.
 *
 * Usage, from api/:
 *   node --max-old-space-size=8192 -r ts-node/register/transpile-only \
 *     src/codeclarity_modules/experiments/parity/build-top100-grid-fixture.ts \
 *     ../private/js-vuln-study-archive/js-vuln-study/studies/top100 \
 *     src/codeclarity_modules/experiments/parity/top100-grid.jsonl.br
 */
/* eslint-disable security/detect-non-literal-fs-filename -- a dev script reading and writing the paths it is given */
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brotliDecompressSync, constants, createBrotliCompress } from "node:zlib";

import type { ProbeCandidate } from "../experiment-probes";
import {
  mapProbePackages,
  mapRunRows,
  NO_LOCKFILE_YET,
  type ProbePackage,
  unwrapResultEnvelope,
  type VulnerabilityInstanceRow,
} from "../experiment-row-copy";

/** Instance columns shared by many instances, stored once per entry. */
export interface GridInstanceMeta {
  vulnerability_id: string | null;
  affected_dependency: string | null;
  severity_class: string | null;
  epss_score: number | null;
  conflict_flag: string | null;
  winning_source: string | null;
  published_date: string | null;
  withdrawn_date: string | null;
  vulnerable_versions: VulnerabilityInstanceRow["vulnerable_versions"];
}

/** One instance: [workspace, index into the entry's meta, affected version, direct]. */
export type GridInstance = [string, number, string | null, boolean];

export interface GridFixtureRun {
  id: string;
  grid_index: number;
  /** YYYY-MM-DD, null for HEAD */
  grid_date: string | null;
  status: "done" | "failed";
  error: string | null;
  commit_hash: string | null;
  committed_at: string | null;
  /** Done runs with rows only */
  summary: { total_dependencies: number; total_vulnerabilities: number; package_manager: string | null } | null;
  instances: GridInstance[];
}

/** One line of the fixture: a dataset entry. */
export interface GridFixtureEntry {
  entry: string;
  npm_name: string;
  rank: number;
  meta: GridInstanceMeta[];
  runs: GridFixtureRun[];
  probes: { commit_hash: string; packages: ProbePackage[] }[];
  probe_intervals: { from_commit: string; to_commit: string; candidates: ProbeCandidate[] }[];
  probe_analyses: { commit_hash: string; status: "failed"; error: string }[];
}

/** One mining unit of mining_cache/results.jsonl, as remediation_events holds it. */
export interface RemediationEvent {
  npm_name: string;
  affected_dependency: string;
  affected_version: string;
  last_seen: string;
  next_snapshot: string;
  status: "found" | "ambiguous" | "not_found";
  method: string;
  fix_commit_sha: string | null;
  fixed_at: string | null;
  fix_kind: string | null;
}

/** The last line of the fixture. */
export interface GridFixtureExpected {
  expected: Record<string, unknown>;
  remediation_events: RemediationEvent[];
}

interface ManifestRow {
  npm_name: string;
  snapshot_date: string;
  state: string;
  rank: number;
  commit_hash: string | null;
  committed_at: string | null;
  project_id: string | null;
  analysis_id: string | null;
  error: string | null;
}

const COMPARED_BLOCKS = [
  "coverage",
  "survival_residence",
  "survival_disclosed",
  "survival_day_resolution",
  "trajectory_balanced",
  "trajectory_balanced_meta",
];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function jsonLines<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/** The cached JSON files of one mining_cache kind, parsed one by one. */
function* cacheFiles<T>(studyDir: string, kind: string): Generator<T> {
  const dir = join(studyDir, "mining_cache", kind);
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".json")) yield readJson(join(dir, name)) as T;
  }
}

/**
 * One package per (name, version, direct), keeping the first workspace:
 * probe dating and fix kinds never read the workspace, and monorepos
 * repeat the same packages in every workspace (970 MB instead of 230 MB unpacked).
 */
export function compactPackages(packages: ProbePackage[]): ProbePackage[] {
  const seen = new Set<string>();
  return packages.filter((p) => {
    const key = `${p.name}@${p.version}@${p.direct}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The JSON lines of a Brotli fixture, split before decoding (it exceeds a string). */
export function fixtureLines(compressed: Buffer): string[] {
  const buffer = brotliDecompressSync(compressed);
  const lines: string[] = [];
  let start = 0;
  for (let end = buffer.indexOf(10); end !== -1; end = buffer.indexOf(10, start)) {
    if (end > start) lines.push(buffer.subarray(start, end).toString("utf8"));
    start = end + 1;
  }
  return lines;
}

async function writeFixture(outPath: string, lines: unknown[]): Promise<void> {
  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
  const compress = createBrotliCompress({
    params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_LGWIN]: 24 },
  });
  const out = createWriteStream(outPath);
  compress.pipe(out);
  for (const line of lines) {
    if (!compress.write(`${JSON.stringify(line)}\n`)) await once(compress, "drain");
  }
  compress.end();
  await once(out, "finish");
}

/** Rewrite an existing fixture with compacted probe packages, without the raw results. */
async function recompact(inPath: string, outPath: string): Promise<void> {
  const lines = fixtureLines(readFileSync(inPath)).map((line) => JSON.parse(line) as GridFixtureEntry | GridFixtureExpected);
  for (const line of lines) {
    if ("probes" in line) for (const probe of line.probes) probe.packages = compactPackages(probe.packages);
  }
  await writeFixture(outPath, lines);
  process.stdout.write(`${lines.length - 1} entries rewritten to ${outPath}\n`);
}

/** Copy one entry's runs and snapshot probe rows from the raw results. */
function copyEntry(studyDir: string, rows: ManifestRow[], dates: string[]): {
  line: GridFixtureEntry;
  names: Set<string>;
} {
  const first = rows[0]!;
  const bySnapshot = new Map(rows.map((row) => [row.snapshot_date, row]));
  const meta: GridInstanceMeta[] = [];
  const metaIndex = new Map<string, number>();
  const names = new Set<string>();
  const sboms = new Map<string, unknown>();
  const runs: GridFixtureRun[] = [...dates, "HEAD"].map((date, gridIndex) => {
    const row = bySnapshot.get(date);
    const base = { grid_index: gridIndex, grid_date: date === "HEAD" ? null : date, summary: null, instances: [] };
    if (!row) {
      // No manifest row: the repo did not exist yet at that date
      return { ...base, id: `${first.npm_name}@${date}`, status: "done", error: NO_LOCKFILE_YET, commit_hash: null, committed_at: null };
    }
    const run = {
      ...base,
      id: row.analysis_id ?? `${first.npm_name}@${date}`,
      commit_hash: row.commit_hash,
      committed_at: row.committed_at,
    };
    if (row.state !== "done" || !row.analysis_id || !row.project_id) {
      return { ...run, status: "failed", error: row.error ?? "failed" };
    }
    const dir = join(studyDir, "raw", row.project_id, row.analysis_id);
    const sbom = unwrapResultEnvelope(readJson(join(dir, "js-sbom.json")));
    const copied = mapRunRows(sbom, unwrapResultEnvelope(readJson(join(dir, "vuln-finder.json"))));
    if (row.commit_hash) sboms.set(row.commit_hash, sbom);
    const instances = copied.vulnerabilities.map((v): GridInstance => {
      const shared: GridInstanceMeta = {
        vulnerability_id: v.vulnerability_id,
        affected_dependency: v.affected_dependency,
        severity_class: v.severity_class,
        epss_score: v.epss_score,
        conflict_flag: v.conflict_flag,
        winning_source: v.winning_source,
        published_date: v.published_date,
        withdrawn_date: v.withdrawn_date,
        vulnerable_versions: v.vulnerable_versions,
      };
      const key = JSON.stringify(shared);
      let index = metaIndex.get(key);
      if (index === undefined) {
        index = meta.push(shared) - 1;
        metaIndex.set(key, index);
      }
      if (v.affected_dependency) names.add(v.affected_dependency);
      return [v.workspace, index, v.affected_version, v.direct_dependency];
    });
    const { total_dependencies, total_vulnerabilities, package_manager } = copied.summary;
    return {
      ...run,
      status: "done",
      error: null,
      summary: { total_dependencies, total_vulnerabilities, package_manager },
      instances,
    };
  });
  // Snapshot commits feed the probe outcome rows too, with the packages instances name
  const probes = [...sboms].map(([commit, sbom]) => ({
    commit_hash: commit,
    packages: compactPackages(mapProbePackages(sbom).filter((p) => names.has(p.name))),
  }));
  return {
    line: {
      entry: first.npm_name,
      npm_name: first.npm_name,
      rank: first.rank,
      meta,
      runs,
      probes,
      probe_intervals: [],
      probe_analyses: [],
    },
    names,
  };
}

interface BlobFile {
  key: { slug: string; sha: string; lockfile: string };
  status: "parsed" | "missing" | "unparseable";
  versions: Record<string, string[]> | null;
}

interface ManifestFile {
  key: { slug: string; sha: string };
  deps: string[] | null;
}

interface CommitListFile {
  key: { slug: string; lockfile: string; since: string; until: string };
  commits: { sha: string; date: string }[];
}

/** The archive's ISO form of a commit date, as its since/until carry it. */
function isoSecond(value: string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Add the probe rows the archive's lockfile mining cached. */
function addMinedProbes(studyDir: string, entries: Map<string, { line: GridFixtureEntry; names: Set<string> }>): void {
  const directAt = new Map<string, Set<string>>();
  for (const file of cacheFiles<ManifestFile>(studyDir, "manifests")) {
    if (file.deps) directAt.set(`${file.key.slug}@${file.key.sha}`, new Set(file.deps));
  }
  const blobsAt = new Map<string, BlobFile[]>();
  for (const file of cacheFiles<BlobFile>(studyDir, "blobs")) {
    const entry = entries.get(file.key.slug);
    if (!entry) continue;
    const versions = file.versions
      ? Object.fromEntries(Object.entries(file.versions).filter(([name]) => entry.names.has(name)))
      : null;
    const key = `${file.key.slug}@${file.key.sha}`;
    blobsAt.set(key, [...(blobsAt.get(key) ?? []), { ...file, versions }]);
  }
  for (const [key, blobs] of blobsAt) {
    const [slug, sha] = [key.slice(0, key.lastIndexOf("@")), key.slice(key.lastIndexOf("@") + 1)];
    const { line } = entries.get(slug)!;
    if (line.probes.some((p) => p.commit_hash === sha)) continue;
    const parsed = blobs.filter((b) => b.status === "parsed");
    const unparseable = blobs.find((b) => b.status === "unparseable");
    if (parsed.length === 0 && unparseable) {
      line.probe_analyses.push({ commit_hash: sha, status: "failed", error: `unparseable ${unparseable.key.lockfile}` });
      continue;
    }
    const direct = directAt.get(key);
    line.probes.push({
      commit_hash: sha,
      packages: compactPackages(
        parsed.flatMap((b) =>
          Object.entries(b.versions ?? {}).flatMap(([name, versions]) =>
            versions.map((version) => ({ workspace: b.key.lockfile, name, version, direct: direct?.has(name) ?? false })),
          ),
        ),
      ),
    });
  }

  // Mined windows, keyed by their two snapshot commits
  const windows = new Map<string, { slug: string; since: string; until: string; commits: Map<string, string> }>();
  for (const file of cacheFiles<CommitListFile>(studyDir, "commit_lists")) {
    if (!entries.has(file.key.slug)) continue;
    const key = `${file.key.slug}|${file.key.since}|${file.key.until}`;
    const window = windows.get(key) ?? { ...file.key, commits: new Map<string, string>() };
    for (const commit of file.commits) window.commits.set(commit.sha, commit.date);
    windows.set(key, window);
  }
  for (const window of windows.values()) {
    const { line } = entries.get(window.slug)!;
    const commitAt = (iso: string): string | null =>
      line.runs.find((r) => r.status === "done" && r.committed_at && isoSecond(r.committed_at) === iso)?.commit_hash ?? null;
    const from = commitAt(window.since);
    const to = commitAt(window.until);
    if (!from || !to) continue;
    if (line.probe_intervals.some((i) => i.from_commit === from && i.to_commit === to)) continue;
    const candidates = [...window.commits]
      .filter(([sha]) => sha !== from)
      .map(([sha, date]) => ({ sha, committed_at: date }))
      .sort((a, b) => a.committed_at.localeCompare(b.committed_at) || a.sha.localeCompare(b.sha));
    line.probe_intervals.push({ from_commit: from, to_commit: to, candidates });
  }
}

async function main(studyDir: string, outPath: string): Promise<void> {
  const manifest = jsonLines<ManifestRow>(join(studyDir, "manifest.jsonl"));
  const dates = [...new Set(manifest.map((r) => r.snapshot_date))].filter((d) => d !== "HEAD").sort();
  const byRepo = new Map<string, ManifestRow[]>();
  for (const row of manifest) byRepo.set(row.npm_name, [...(byRepo.get(row.npm_name) ?? []), row]);

  const entries = new Map<string, { line: GridFixtureEntry; names: Set<string> }>();
  for (const [name, rows] of byRepo) {
    entries.set(name, copyEntry(studyDir, rows, dates));
    process.stdout.write(`copied ${entries.size}/${byRepo.size} ${name}\n`);
  }
  addMinedProbes(studyDir, entries);

  const numbers = readJson(join(studyDir, "tables", "results_numbers.json")) as Record<string, unknown>;
  const last: GridFixtureExpected = {
    expected: Object.fromEntries(COMPARED_BLOCKS.map((block) => [block, numbers[block]])),
    remediation_events: jsonLines<RemediationEvent & { unit_key: string }>(
      join(studyDir, "mining_cache", "results.jsonl"),
    ).map((e) => ({
      npm_name: e.npm_name,
      affected_dependency: e.affected_dependency,
      affected_version: e.affected_version,
      last_seen: e.last_seen,
      next_snapshot: e.next_snapshot,
      status: e.status,
      method: e.method,
      fix_commit_sha: e.fix_commit_sha,
      fixed_at: e.fixed_at,
      fix_kind: e.fix_kind,
    })),
  };

  await writeFixture(outPath, [...[...entries.values()].map((e) => e.line), last]);
  process.stdout.write(`${entries.size} entries written to ${outPath}\n`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const again = args[0] === "--recompact";
  const [source, outPath] = again ? args.slice(1) : args;
  if (!source || !outPath) {
    process.stderr.write("usage: build-top100-grid-fixture.ts [--recompact <in .jsonl.br> | <study dir>] <out .jsonl.br>\n");
    process.exit(2);
  }
  (again ? recompact(source, outPath) : main(source, outPath)).catch((err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  });
}
