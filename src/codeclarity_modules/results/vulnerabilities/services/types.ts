/**
 * Internal types for the refactored vulnerability report generation pipeline.
 *
 * The pipeline works in three stages:
 *   1. Range Extraction  – parse raw NVD/OSV/GCVE entities into SourceRangeData
 *   2. Version Checking   – determine if an installed version falls within ranges
 *   3. Source Comparison   – compare verdicts from multiple sources
 */

/** A single normalised version range from any source. */
export interface ParsedRange {
  /** Lower bound version string, or "0" meaning "earliest". null = no lower bound. */
  introduced: string | null;
  /** Whether introduced is inclusive (>=) or exclusive (>). */
  introducedInclusive: boolean;
  /** Upper bound version string. null = no upper bound (open-ended). */
  fixed: string | null;
  /** Whether fixed is inclusive (<=) or exclusive (<). */
  fixedInclusive: boolean;
}

export type SourceName = "NVD" | "OSV" | "GCVE";

/** All range data extracted from a single source (or a single NVD affected entry). */
export interface SourceRangeData {
  source: SourceName;
  /** Structured version ranges. May contain multiple disjoint ranges. */
  ranges: ParsedRange[];
  /** Exact affected version strings. */
  exactVersions: string[];
  /** True if the source says ALL versions are affected (universal / wildcard). */
  universal: boolean;
  /** NVD CPE product name (for filtering irrelevant products). */
  product?: string | undefined;
  /** NVD CPE vendor name. */
  vendor?: string | undefined;
  /** OSV package name. */
  packageName?: string | undefined;
}

/** The definitive verdict for a specific installed version against one source. */
export interface SourceVerdict {
  source: SourceName;
  /** Whether the installed version is in the source's affected ranges. */
  affected: boolean;
  /** true if we could definitively check; false if data is insufficient. */
  definitive: boolean;
  /** Human-readable explanation of why. */
  reason: string;
  /** Compact range strings for the "all versions" display field. */
  allVersionsRaw: string;
}

/** Result of comparing verdicts from all available sources. Matches the existing API response shape. */
export interface ComparisonResult {
  nvd: string;
  osv: string;
  gcve: string;
  agree: boolean;
  nvdReason: string;
  osvReason: string;
  gcveReason: string;
  nvdAllVersions: string;
  osvAllVersions: string;
  gcveAllVersions: string;
}
