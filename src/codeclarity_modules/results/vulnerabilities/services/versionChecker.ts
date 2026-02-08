/**
 * Version checker module.
 *
 * Determines whether an installed version falls within a set of
 * structured version ranges using actual semver comparison.
 * All functions are pure (no DI / no side-effects).
 */

import { coerce, gt, gte, lt, lte, valid } from "semver";

import { formatRange, formatRangesRaw } from "./rangeExtractor";
import type { ParsedRange, SourceRangeData, SourceVerdict } from "./types";

/** Clean a version string for semver comparison. */
export function cleanVersion(version: string): string | null {
  const stripped = version.replace(/^v/, "");
  if (valid(stripped)) return stripped;
  const coerced = coerce(stripped);
  return coerced ? coerced.version : null;
}

/**
 * Check if a (cleaned, valid semver) version is within a single ParsedRange.
 *
 * `introduced: "0"` is treated as no lower bound (from the earliest version).
 */
function isVersionInRange(version: string, range: ParsedRange): boolean {
  // Lower bound check (empty string treated as "0" = no lower bound)
  if (
    range.introduced !== null &&
    range.introduced !== "0" &&
    range.introduced !== ""
  ) {
    const introClean = cleanVersion(range.introduced);
    if (!introClean) return false; // Can't parse lower bound — assume not in range
    if (range.introducedInclusive) {
      if (!gte(version, introClean)) return false;
    } else {
      if (!gt(version, introClean)) return false;
    }
  }

  // Upper bound check (empty string treated as null = no upper bound)
  if (range.fixed !== null && range.fixed !== "") {
    const fixedClean = cleanVersion(range.fixed);
    if (!fixedClean) return false; // Can't parse upper bound — assume not in range
    if (range.fixedInclusive) {
      if (!lte(version, fixedClean)) return false;
    } else {
      if (!lt(version, fixedClean)) return false;
    }
  }

  return true;
}

export interface VersionCheckResult {
  affected: boolean;
  definitive: boolean;
  reason: string;
}

/**
 * Determine whether `installedVersion` is affected according to `rangeData`.
 *
 * Returns a definitive verdict when possible, or a non-definitive one when
 * the version string cannot be parsed or the source has no data.
 */
export function checkVersionAgainstSource(
  installedVersion: string,
  rangeData: SourceRangeData,
): VersionCheckResult {
  const clean = cleanVersion(installedVersion);

  if (!clean) {
    return {
      affected: false,
      definitive: false,
      reason: `Unable to parse version "${installedVersion}"`,
    };
  }

  // 1. Check exact versions first
  for (const exact of rangeData.exactVersions) {
    const exactClean = cleanVersion(exact);
    if (exactClean && exactClean === clean) {
      return {
        affected: true,
        definitive: true,
        reason: `Version ${installedVersion} is explicitly listed as affected`,
      };
    }
  }

  // 2. Check universal flag
  if (rangeData.universal) {
    return {
      affected: true,
      definitive: true,
      reason: "All versions are affected",
    };
  }

  // 3. Check each range
  for (const range of rangeData.ranges) {
    if (isVersionInRange(clean, range)) {
      return {
        affected: true,
        definitive: true,
        reason: `Version ${installedVersion} is in affected range ${formatRange(range)}`,
      };
    }
  }

  // 4. Not in any range
  if (rangeData.ranges.length > 0 || rangeData.exactVersions.length > 0) {
    return {
      affected: false,
      definitive: true,
      reason: `Version ${installedVersion} is NOT in ${rangeData.source}'s known affected ranges`,
    };
  }

  // 5. Source has no range data at all
  return {
    affected: false,
    definitive: false,
    reason: "",
  };
}

/**
 * Build a full SourceVerdict for a given source, installed version,
 * and (already-merged) range data.
 */
export function buildSourceVerdict(
  installedVersion: string,
  rangeData: SourceRangeData,
): SourceVerdict {
  const check = checkVersionAgainstSource(installedVersion, rangeData);
  return {
    source: rangeData.source,
    affected: check.affected,
    definitive: check.definitive,
    reason: check.reason,
    allVersionsRaw: formatRangesRaw(rangeData),
  };
}
