/**
 * Builds the parity fixture of the experiment results (spec #23,
 * "Acceptance (parity)") from the archived js-vuln-study top100 study: the
 * done HEAD rows of its manifest, with their raw js-sbom and vuln-finder
 * results trimmed to the fields the row copy reads.
 *
 * The trimmed results keep the shape of the raw JSON, Result envelope
 * included, so the parity test still runs them through unwrapResultEnvelope
 * and mapRunRows. The raw results are about 1.5 GB, so they are parsed one
 * file at a time and written out as Brotli-compressed JSON lines, one run
 * per line. Brotli (in node:zlib) with a 16 MB window catches the
 * dependency trees repeated across workspaces, which gzip cannot: 0.7 MB
 * instead of 6.4 MB, small enough to commit.
 *
 * Usage, from api/:
 *   node --max-old-space-size=4096 -r ts-node/register/transpile-only \
 *     src/codeclarity_modules/experiments/parity/build-top100-fixture.ts \
 *     <study dir, e.g. ../private/js-vuln-study-archive/js-vuln-study/studies/top100> \
 *     src/codeclarity_modules/experiments/parity/top100-head.jsonl.br
 */
/* eslint-disable security/detect-non-literal-fs-filename -- a dev script reading and writing the paths it is given */
import { once } from "node:events";
import { createWriteStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { constants, createBrotliCompress } from "node:zlib";

/** One line of the fixture. */
export interface ParityFixtureRun {
  run_id: string;
  rank: number;
  sbom: unknown;
  vulns: unknown;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(source: unknown, keys: readonly string[]): JsonObject {
  const out: JsonObject = {};
  if (!isObject(source)) return out;
  for (const key of keys) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

function mapValues(
  source: unknown,
  fn: (value: unknown) => unknown,
): JsonObject {
  if (!isObject(source)) return {};
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, fn(value)]),
  );
}

/** The Result envelope around a trimmed plugin payload. */
function envelope(raw: unknown, trim: (payload: unknown) => JsonObject): JsonObject {
  return { result: trim(isObject(raw) ? raw["result"] : undefined) };
}

const DEPENDENCY_FLAGS = ["Direct", "Transitive", "Dev", "Prod"] as const;

function objectOrEmpty(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

/** The dependency flags that are set; an absent flag reads as false. */
function trueFlags(flags: unknown): JsonObject {
  const out: JsonObject = {};
  if (!isObject(flags)) return out;
  for (const flag of DEPENDENCY_FLAGS) if (flags[flag]) out[flag] = true;
  return out;
}

/**
 * The SBOM keeps one entry per (workspace, package, version) with its set
 * flags, which is all the row copy counts. Package names and versions are
 * replaced by short positional keys: the row copy never reads them, and
 * the real ones make the fixture ten times larger.
 */
function trimSbom(payload: unknown): JsonObject {
  const info = isObject(payload) ? payload["analysis_info"] : undefined;
  const workspaces = isObject(payload) ? payload["workspaces"] : undefined;
  return {
    analysis_info: pick(info, ["package_manager", "status"]),
    workspaces: mapValues(workspaces, (ws) => ({
      dependencies: Object.fromEntries(
        Object.values(objectOrEmpty(isObject(ws) ? ws["dependencies"] : undefined)).map(
          (versions, i) => [
            i.toString(36),
            Object.fromEntries(
              Object.values(objectOrEmpty(versions)).map((flags, j) => [
                j.toString(36),
                trueFlags(flags),
              ]),
            ),
          ],
        ),
      ),
    })),
  };
}

const MATCH_FIELDS: Record<string, readonly string[]> = {
  NVDMatch: ["Published", "LastModified"],
  OSVMatch: ["published", "modified", "withdrawn"],
  GCVEMatch: ["datePublished", "dateUpdated"],
};

function trimFinding(finding: unknown): JsonObject {
  const out = pick(finding, [
    "VulnerabilityId",
    "AffectedDependency",
    "AffectedVersion",
    "EPSS",
    "direct_dependency",
  ]);
  if (!isObject(finding)) return out;
  out["Severity"] = pick(finding["Severity"], [
    "SeverityClass",
    "Severity",
    "Vector",
    "Impact",
    "Exploitability",
  ]);
  out["Conflict"] = pick(finding["Conflict"], [
    "ConflictFlag",
    "ConflictWinner",
  ]);
  for (const [key, fields] of Object.entries(MATCH_FIELDS)) {
    const match = finding[key];
    if (isObject(match) && isObject(match["Vulnerability"])) {
      out[key] = { Vulnerability: pick(match["Vulnerability"], fields) };
    }
  }
  return out;
}

function trimVulns(payload: unknown): JsonObject {
  const info = isObject(payload) ? payload["analysis_info"] : undefined;
  const workspaces = isObject(payload) ? payload["workspaces"] : undefined;
  return {
    analysis_info: pick(info, ["status"]),
    workspaces: mapValues(workspaces, (ws) => {
      const findings = isObject(ws) ? ws["Vulnerabilities"] : undefined;
      return {
        Vulnerabilities: Array.isArray(findings) ? findings.map(trimFinding) : [],
      };
    }),
  };
}

interface ManifestRow {
  snapshot_date?: string;
  state?: string;
  rank?: number;
  project_id?: string | null;
  analysis_id?: string | null;
}

interface HeadRun {
  rank: number;
  project_id: string;
  analysis_id: string;
}

/** The done HEAD rows with an analysis and a project, in manifest order. */
export function headDoneRows(manifest: string): HeadRun[] {
  return manifest
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ManifestRow)
    .filter(
      (row): row is ManifestRow & HeadRun =>
        row.snapshot_date === "HEAD" &&
        row.state === "done" &&
        typeof row.rank === "number" &&
        Boolean(row.analysis_id) &&
        Boolean(row.project_id),
    );
}

async function main(studyDir: string, outPath: string): Promise<void> {
  const rows = headDoneRows(readFileSync(join(studyDir, "manifest.jsonl"), "utf8"));
  const compress = createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 24,
    },
  });
  const out = createWriteStream(outPath);
  compress.pipe(out);
  for (const row of rows) {
    const dir = join(studyDir, "raw", row.project_id, row.analysis_id);
    const sbom = envelope(
      JSON.parse(readFileSync(join(dir, "js-sbom.json"), "utf8")),
      trimSbom,
    );
    const vulns = envelope(
      JSON.parse(readFileSync(join(dir, "vuln-finder.json"), "utf8")),
      trimVulns,
    );
    const line: ParityFixtureRun = {
      run_id: row.analysis_id,
      rank: row.rank,
      sbom,
      vulns,
    };
    if (!compress.write(`${JSON.stringify(line)}\n`)) await once(compress, "drain");
  }
  compress.end();
  await once(out, "finish");
  process.stdout.write(`${rows.length} runs written to ${outPath}\n`);
}

if (require.main === module) {
  const [studyDir, outPath] = process.argv.slice(2);
  if (!studyDir || !outPath) {
    process.stderr.write("usage: build-top100-fixture.ts <study dir> <out .jsonl.br>\n");
    process.exit(2);
  }
  main(studyDir, outPath).catch((err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  });
}
