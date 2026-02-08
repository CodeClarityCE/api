/**
 * Range extraction module.
 *
 * Extracts structured SourceRangeData from raw NVD, OSV, and GCVE database
 * entities. All functions are pure (no DI / no side-effects).
 */

import type { GCVE } from "src/codeclarity_modules/knowledge/gcve/gcve.entity";
import type { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import type { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";

import type { ParsedRange, SourceRangeData } from "./types";

// ---------------------------------------------------------------------------
// Raw JSONB shape interfaces (mirrors what the DB stores)
// ---------------------------------------------------------------------------

interface NVDAffectedSource {
  versionEndExcluding?: string;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  criteriaDict?: {
    version?: string;
    product?: string;
    vendor?: string;
    [key: string]: unknown;
  };
}

interface NVDAffectedEntry {
  sources?: NVDAffectedSource[];
  [key: string]: unknown;
}

interface OSVEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  [key: string]: unknown;
}

interface OSVRange {
  events?: OSVEvent[];
  [key: string]: unknown;
}

interface OSVAffectedEntry {
  versions?: unknown[];
  ranges?: OSVRange[];
  package?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface GCVEVersionEntry {
  version?: string;
  status?: string;
  lessThan?: string;
  lessThanOrEqual?: string;
  versionType?: string;
}

interface GCVEAffectedEntry {
  vendor?: string;
  product?: string;
  versions?: GCVEVersionEntry[];
  defaultStatus?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// NVD extraction
// ---------------------------------------------------------------------------

/**
 * Extract structured range data from an NVD entity.
 * Returns one SourceRangeData per affected entry so that product-level
 * filtering can be applied downstream.
 */
export function extractNVDRanges(nvdItem: NVD): SourceRangeData[] {
  if (!nvdItem.affected) return [];

  const entries = nvdItem.affected as NVDAffectedEntry[];
  const results: SourceRangeData[] = [];

  for (const entry of entries) {
    if (!entry.sources) continue;

    const ranges: ParsedRange[] = [];
    const exactVersions: string[] = [];
    let universal = false;
    let product: string | undefined;
    let vendor: string | undefined;

    for (const src of entry.sources) {
      // Capture product/vendor from the first source that has it
      if (!product && src.criteriaDict?.product) {
        product = src.criteriaDict.product;
      }
      if (!vendor && src.criteriaDict?.vendor) {
        vendor = src.criteriaDict.vendor;
      }

      const hasStartIncl = src.versionStartIncluding;
      const hasStartExcl = src.versionStartExcluding;
      const hasEndExcl = src.versionEndExcluding;
      const hasEndIncl = src.versionEndIncluding;
      const hasStart = hasStartIncl ?? hasStartExcl;
      const hasEnd = hasEndExcl ?? hasEndIncl;

      if (hasStart || hasEnd) {
        ranges.push({
          introduced: hasStart ?? null,
          introducedInclusive: !!hasStartIncl,
          fixed: hasEnd ?? null,
          fixedInclusive: !!hasEndIncl,
        });
      } else if (
        src.criteriaDict?.version &&
        src.criteriaDict.version !== "*" &&
        src.criteriaDict.version !== "" &&
        src.criteriaDict.version !== "-"
      ) {
        exactVersions.push(src.criteriaDict.version);
      } else if (src.criteriaDict?.version === "*") {
        universal = true;
      }
    }

    // Skip entries that are only universal wildcards when ranges exist
    if (universal && ranges.length > 0) {
      universal = false;
    }

    results.push({
      source: "NVD",
      ranges,
      exactVersions,
      universal,
      product,
      vendor,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// OSV extraction
// ---------------------------------------------------------------------------

/** Process a single OSV event list into ParsedRange entries (state machine). */
function processOSVEvents(events: OSVEvent[], ranges: ParsedRange[]): void {
  let currentIntroduced: string | null = null;

  for (const event of events) {
    if (event.introduced !== undefined) {
      // Normalize empty string to "0" (meaning "from the earliest version")
      currentIntroduced = event.introduced || "0";
    }
    if (
      event.fixed !== undefined &&
      event.fixed !== "" &&
      currentIntroduced !== null
    ) {
      ranges.push({
        introduced: currentIntroduced,
        introducedInclusive: true,
        fixed: event.fixed,
        fixedInclusive: false,
      });
      currentIntroduced = null;
    }
    if (
      event.last_affected !== undefined &&
      event.last_affected !== "" &&
      currentIntroduced !== null
    ) {
      ranges.push({
        introduced: currentIntroduced,
        introducedInclusive: true,
        fixed: event.last_affected,
        fixedInclusive: true,
      });
      currentIntroduced = null;
    }
  }

  // Open-ended range (introduced with no closing event)
  if (currentIntroduced !== null) {
    ranges.push({
      introduced: currentIntroduced,
      introducedInclusive: true,
      fixed: null,
      fixedInclusive: false,
    });
  }
}

/**
 * Extract structured range data from an OSV entity.
 * Uses a state-machine approach for events so that multiple disjoint ranges
 * within a single affected entry are all preserved (fixes the multi-range bug).
 * Preserves `introduced: "0"` which means "from the earliest version".
 */
export function extractOSVRanges(osvItem: OSV): SourceRangeData[] {
  if (!osvItem.affected) return [];

  const entries = osvItem.affected as OSVAffectedEntry[];
  const results: SourceRangeData[] = [];

  for (const entry of entries) {
    const ranges: ParsedRange[] = [];
    const exactVersions: string[] = [];
    const packageName = entry.package?.name;

    // Process range events using a state machine
    if (entry.ranges && Array.isArray(entry.ranges)) {
      for (const range of entry.ranges) {
        if (!range.events || !Array.isArray(range.events)) continue;
        processOSVEvents(range.events, ranges);
      }
    }

    // Collect explicit version lists
    if (entry.versions && Array.isArray(entry.versions)) {
      for (const v of entry.versions) {
        const vStr = String(v);
        const clean = vStr.startsWith("v") ? vStr.slice(1) : vStr;
        if (!exactVersions.includes(clean)) {
          exactVersions.push(clean);
        }
      }
    }

    if (ranges.length > 0 || exactVersions.length > 0) {
      results.push({
        source: "OSV",
        ranges,
        exactVersions,
        universal: false,
        packageName,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// GCVE extraction
// ---------------------------------------------------------------------------

/**
 * Normalise GCVE version entries that embed operators in the version string,
 * e.g. `version: "< 7.5.7"` → `{ lessThan: "7.5.7" }`.
 *
 * Also handles compound strings like `">= 2.0.0, < 2.3.0"` which encode both
 * the start and end of a range in a single version field.
 */
function normalizeGCVEVersion(ver: GCVEVersionEntry): GCVEVersionEntry {
  if (ver.lessThan || ver.lessThanOrEqual) return ver;
  if (!ver.version) return ver;

  const v = ver.version.trim();
  const { version: _v, ...rest } = ver;

  // Compound range: ">= X, < Y" or ">= X, <= Y" (also > X variants)
  const compoundMatch = /^(>=?)\s*([^,]+?)\s*,\s*(<=?)\s*(.+)$/.exec(v);
  if (compoundMatch) {
    const startVer = compoundMatch[2]!.trim();
    const endOp = compoundMatch[3]!;
    const endVer = compoundMatch[4]!.trim();
    const result: GCVEVersionEntry = { ...rest, version: startVer };
    if (endOp === "<=") {
      result.lessThanOrEqual = endVer;
    } else {
      result.lessThan = endVer;
    }
    return result;
  }

  const leMatch = /^<=\s*(.+)$/.exec(v);
  if (leMatch) return { ...rest, lessThanOrEqual: leMatch[1]!.trim() };

  const ltMatch = /^<\s*(.+)$/.exec(v);
  if (ltMatch) return { ...rest, lessThan: ltMatch[1]!.trim() };

  const geMatch = /^>=\s*(.+)$/.exec(v);
  if (geMatch) return { ...ver, version: geMatch[1]!.trim() };

  const gtMatch = /^>\s*(.+)$/.exec(v);
  if (gtMatch) return { ...ver, version: gtMatch[1]!.trim() };

  return ver;
}

const GCVE_SPECIAL_VERSIONS = new Set([
  "0",
  "n/a",
  "unspecified",
  "*",
  "-",
  "",
]);

/**
 * Extract structured range data from a GCVE entity (CVE Record v5.x format).
 */
export function extractGCVERanges(gcveItem: GCVE): SourceRangeData[] {
  if (!gcveItem.affected) return [];

  const entries = gcveItem.affected as GCVEAffectedEntry[];
  const results: SourceRangeData[] = [];

  for (const entry of entries) {
    const ranges: ParsedRange[] = [];
    const exactVersions: string[] = [];
    let universal = false;

    if (entry.versions && Array.isArray(entry.versions)) {
      for (const rawVer of entry.versions) {
        const ver = normalizeGCVEVersion(rawVer);
        const isSpecial = GCVE_SPECIAL_VERSIONS.has(ver.version ?? "");

        if (ver.lessThan) {
          ranges.push({
            introduced: isSpecial ? "0" : (ver.version ?? null),
            introducedInclusive: true,
            fixed: ver.lessThan,
            fixedInclusive: false,
          });
        } else if (ver.lessThanOrEqual) {
          ranges.push({
            introduced: isSpecial ? "0" : (ver.version ?? null),
            introducedInclusive: true,
            fixed: ver.lessThanOrEqual,
            fixedInclusive: true,
          });
        } else if (ver.status === "affected" && ver.version && isSpecial) {
          universal = true;
        } else if (
          ver.status === "affected" &&
          ver.version &&
          !exactVersions.includes(ver.version)
        ) {
          exactVersions.push(ver.version);
        }
      }
    }

    // defaultStatus: "affected" with no versions
    if (
      (!entry.versions || entry.versions.length === 0) &&
      entry.defaultStatus === "affected"
    ) {
      universal = true;
    }

    if (ranges.length > 0 || exactVersions.length > 0 || universal) {
      results.push({
        source: "GCVE",
        ranges,
        exactVersions,
        universal,
        product: entry.product,
        vendor: entry.vendor,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// NVD package filtering
// ---------------------------------------------------------------------------

/**
 * Filter NVD range entries to keep only those whose `product` plausibly
 * matches the package being analysed.
 *
 * If no product metadata is available on any entry, all entries are returned.
 */
export function filterNVDByPackage(
  entries: SourceRangeData[],
  packageName: string,
): SourceRangeData[] {
  if (!packageName) return entries;

  // Normalise the package name: strip scope, lowercase, hyphens
  const pkgNorm = packageName
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/_/g, "-");

  // If none of the entries have product info, we can't filter
  const anyHasProduct = entries.some((e) => !!e.product);
  if (!anyHasProduct) return entries;

  return entries.filter((entry) => {
    if (!entry.product) return true; // No product info, keep it
    const productNorm = entry.product.toLowerCase().replace(/_/g, "-");
    return productNorm.includes(pkgNorm) || pkgNorm.includes(productNorm);
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a ParsedRange as a compact string like `>=1.0.0 <2.0.0`. */
export function formatRange(range: ParsedRange): string {
  const parts: string[] = [];

  if (
    range.introduced !== null &&
    range.introduced !== "0" &&
    range.introduced !== ""
  ) {
    parts.push(
      range.introducedInclusive
        ? `>=${range.introduced}`
        : `>${range.introduced}`,
    );
  }

  if (range.fixed !== null && range.fixed !== "") {
    parts.push(range.fixedInclusive ? `<=${range.fixed}` : `<${range.fixed}`);
  }

  if (parts.length === 0) {
    // Open-ended from the beginning
    return "*";
  }

  return parts.join(" ");
}

/** Format a SourceRangeData as a compact multi-line string for display. */
export function formatRangesRaw(data: SourceRangeData): string {
  const parts: string[] = [];

  for (const range of data.ranges) {
    parts.push(formatRange(range));
  }

  for (const v of data.exactVersions) {
    parts.push(v);
  }

  if (data.universal && parts.length === 0) {
    parts.push("*");
  }

  return [...new Set(parts)].join("\n");
}

/**
 * Format a ParsedRange as a human-readable string
 * like "1.0.0 up to (but not including) 2.0.0".
 */
export function formatRangeHuman(range: ParsedRange): string {
  const hasLower =
    range.introduced !== null &&
    range.introduced !== "0" &&
    range.introduced !== "";
  const intro = hasLower ? range.introduced! : "all versions";

  if (range.fixed !== null) {
    if (range.fixedInclusive) {
      return `${intro} up to ${range.fixed} (inclusive)`;
    }
    return `${intro} up to (but not including) ${range.fixed}`;
  }

  if (hasLower) {
    return `${range.introduced} and later`;
  }

  return "all versions";
}

/**
 * Build a human-readable affected versions string from multiple
 * SourceRangeData entries (already filtered to the correct package).
 */
export function buildAffectedVersionsString(
  entries: SourceRangeData[],
): string {
  const parts: string[] = [];

  for (const data of entries) {
    for (const range of data.ranges) {
      parts.push(formatRangeHuman(range));
    }
    if (data.exactVersions.length === 1) {
      parts.push(`exactly ${data.exactVersions[0]}`);
    } else if (data.exactVersions.length > 1) {
      parts.push(`specific versions: ${data.exactVersions.join(", ")}`);
    }
    if (
      data.universal &&
      data.ranges.length === 0 &&
      data.exactVersions.length === 0
    ) {
      parts.push("all versions");
    }
  }

  return [...new Set(parts)].join(", ");
}

/**
 * Merge multiple SourceRangeData entries (from the same source) into one.
 */
export function mergeSourceRangeData(
  entries: SourceRangeData[],
): SourceRangeData | null {
  if (entries.length === 0) return null;

  const merged: SourceRangeData = {
    source: entries[0]!.source,
    ranges: [],
    exactVersions: [],
    universal: false,
  };

  for (const entry of entries) {
    merged.ranges.push(...entry.ranges);
    for (const v of entry.exactVersions) {
      if (!merged.exactVersions.includes(v)) {
        merged.exactVersions.push(v);
      }
    }
    if (entry.universal) merged.universal = true;
    if (entry.packageName) merged.packageName = entry.packageName;
  }

  return merged;
}
