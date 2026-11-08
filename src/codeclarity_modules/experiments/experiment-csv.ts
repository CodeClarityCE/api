/**
 * CSV encoding for experiment exports (RFC 4180: comma separated, CRLF line
 * ends, cells quoted when they hold a comma, quote, CR or LF, quotes
 * doubled). Pure: no Nest or TypeORM imports.
 *
 * Formula injection guard (OWASP "CSV Injection"): a string cell starting
 * with `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single quote, so a
 * spreadsheet shows it as text instead of evaluating it. The guard applies
 * to strings only: numbers, booleans and dates are written as is, so a
 * negative number stays numeric. Consumers parsing the CSV programmatically
 * see the leading quote on such strings (e.g. an error message starting
 * with "-").
 */

import { Readable } from "node:stream";

import type { Exposure } from "./experiment-exposures";

/** A row of an export, keyed by the CSV header names. */
export type CsvRow = Record<string, unknown>;

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * runs.csv: one row per run (snapshot); summary columns blank unless the
 * run is done. grid_date is the snapshot's calendar day, "HEAD" for HEAD.
 */
export const RUN_CSV_COLUMNS = [
  "rank",
  "full_name",
  "stars",
  "git_url",
  "grid_date",
  "status",
  "error",
  "attempts",
  "branch",
  "commit_hash",
  "committed_at",
  "analysis_id",
  "total_dependencies",
  "direct_dependencies",
  "transitive_dependencies",
  "dev_dependencies",
  "prod_dependencies",
  "package_manager",
  "total_vulnerabilities",
  "vulnerable_dependencies",
  "direct_vulnerabilities",
  "transitive_vulnerabilities",
  "n_critical",
  "n_high",
  "n_medium",
  "n_low",
  "n_none",
] as const;

/**
 * vulnerabilities.csv: one row per copied vulnerability instance, once per
 * analyzed commit. grid_date and commit_hash are those of the snapshot that
 * holds the rows; snapshots sharing its commit (see runs.csv) share them.
 */
export const VULNERABILITY_CSV_COLUMNS = [
  "rank",
  "full_name",
  "stars",
  "git_url",
  "grid_date",
  "commit_hash",
  "workspace",
  "vulnerability_id",
  "affected_dependency",
  "affected_version",
  "direct_dependency",
  "severity_class",
  "severity_score",
  "severity_vector",
  "impact",
  "exploitability",
  "epss_score",
  "epss_percentile",
  "conflict_flag",
  "winning_source",
  "published_date",
  "modified_date",
  "withdrawn_date",
] as const;

/**
 * exposures.csv: one row per exposure, computed on read. Grid dates are
 * "HEAD" for HEAD; introduction columns are blank when the exposure was
 * present at the first snapshot, fix columns blank while it is open.
 */
export const EXPOSURE_CSV_COLUMNS = [
  "rank",
  "full_name",
  "vulnerability_id",
  "affected_dependency",
  "severity",
  "published_date",
  "first_present",
  "last_present",
  "gaps",
  "status",
  "introduction_date",
  "introduction_commit",
  "introduction_precision",
  "residence_days",
  "fix_date",
  "fix_commit",
  "fix_precision",
  "fix_kind",
  "lag_days",
] as const;

/**
 * fixes.csv: one row per fix, computed on read. probe_outcome is blank
 * until fix probes end, probe_reason says why one found no commit;
 * interval_from and interval_to bracket the fix.
 */
export const FIX_CSV_COLUMNS = [
  "rank",
  "full_name",
  "vulnerability_id",
  "affected_dependency",
  "severity",
  "published_date",
  "fix_date",
  "fix_commit",
  "fix_kind",
  "precision",
  "probe_outcome",
  "probe_reason",
  "interval_from",
  "interval_to",
  "lag_days",
] as const;

/** The entry columns every computed export starts with. */
export interface CsvEntry {
  rank: number;
  full_name: string;
}

const gridCell = (gridDate: string | null): string => gridDate ?? "HEAD";

/** One exposures.csv row. */
export function exposureCsvRow(entry: CsvEntry, exposure: Exposure): CsvRow {
  const { introduction: intro, fix } = exposure;
  return {
    rank: entry.rank,
    full_name: entry.full_name,
    vulnerability_id: exposure.vulnerability_id,
    affected_dependency: exposure.affected_dependency,
    severity: exposure.severity,
    published_date: exposure.published_date,
    first_present: gridCell(exposure.first_present),
    last_present: gridCell(exposure.last_present),
    gaps: exposure.gaps,
    status: exposure.open ? "open" : "fixed",
    introduction_date: intro?.date,
    introduction_commit: intro?.commit_hash,
    introduction_precision: intro?.precision,
    residence_days: intro?.residence_days,
    fix_date: fix?.date,
    fix_commit: fix?.commit_hash,
    fix_precision: fix?.precision,
    fix_kind: fix?.kind,
    lag_days: fix?.lag_days,
  };
}

/** The fixes.csv row of a fixed exposure, null while it is open. */
export function fixCsvRow(entry: CsvEntry, exposure: Exposure): CsvRow | null {
  const { fix } = exposure;
  if (!fix) return null;
  return {
    rank: entry.rank,
    full_name: entry.full_name,
    vulnerability_id: exposure.vulnerability_id,
    affected_dependency: exposure.affected_dependency,
    severity: exposure.severity,
    published_date: exposure.published_date,
    fix_date: fix.date,
    fix_commit: fix.commit_hash,
    fix_kind: fix.kind,
    precision: fix.precision,
    probe_outcome: fix.probe_outcome,
    probe_reason: fix.probe_reason,
    interval_from: gridCell(fix.interval_from),
    interval_to: gridCell(fix.interval_to),
    lag_days: fix.lag_days,
  };
}

/** Encodes one cell value. Blank for null and undefined. */
export function encodeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  let text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length > 0 && FORMULA_TRIGGERS.has(text[0]!)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Encodes the header line: the column names, in order. */
export function encodeCsvHeader(columns: readonly string[]): string {
  return `${columns.map(encodeCsvCell).join(",")}\r\n`;
}

/** Encodes one row as a CSV line, cells in `columns` order. */
export function encodeCsvRow(columns: readonly string[], row: CsvRow): string {
  return `${columns.map((column) => encodeCsvCell(row[column])).join(",")}\r\n`;
}

/**
 * Reads the next chunk of an export, in a stable order, after `after` (the
 * last row of the previous chunk, null for the first). An empty chunk ends
 * the export. Keyset pagination: the source derives its cursor from `after`.
 */
export type CsvChunkSource = (after: CsvRow | null) => Promise<CsvRow[]>;

/**
 * Streams a CSV export: the header, then each chunk's rows. Chunks are
 * pulled only as the consumer reads (one chunk buffered at most), so the
 * whole export is never held in memory. A failing chunk fails the stream.
 */
export function streamCsv(
  columns: readonly string[],
  nextChunk: CsvChunkSource,
): Readable {
  async function* lines(): AsyncGenerator<string> {
    yield encodeCsvHeader(columns);
    let after: CsvRow | null = null;
    for (;;) {
      const rows = await nextChunk(after);
      if (rows.length === 0) return;
      yield rows.map((row) => encodeCsvRow(columns, row)).join("");
      after = rows[rows.length - 1]!;
    }
  }
  return Readable.from(lines(), { highWaterMark: 1 });
}
