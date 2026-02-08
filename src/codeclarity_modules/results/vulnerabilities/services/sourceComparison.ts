/**
 * Source comparison module.
 *
 * Compares verdicts from NVD, OSV, and GCVE to determine whether they
 * agree on the vulnerability status of an installed version.
 * All functions are pure (no DI / no side-effects).
 */

import type { GCVE } from "src/codeclarity_modules/knowledge/gcve/gcve.entity";
import type { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import type { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";

import {
  extractGCVERanges,
  extractNVDRanges,
  extractOSVRanges,
  filterNVDByPackage,
  mergeSourceRangeData,
} from "./rangeExtractor";
import type { ComparisonResult, SourceVerdict } from "./types";
import { buildSourceVerdict } from "./versionChecker";

/**
 * Compare source verdicts to determine if they agree.
 *
 * Agreement means: all sources that have definitive data agree on
 * whether the installed version is affected (true) or not (false).
 * If only one source has definitive data, it is considered "agreed"
 * (nothing to disagree with).
 */
export function compareSourceVerdicts(
  verdicts: SourceVerdict[],
): ComparisonResult {
  const definitive = verdicts.filter((v) => v.definitive);

  const agree =
    definitive.length <= 1 ||
    definitive.every((v) => v.affected === definitive[0]!.affected);

  const findVerdict = (source: string) =>
    verdicts.find((v) => v.source === source);

  const nvd = findVerdict("NVD");
  const osv = findVerdict("OSV");
  const gcve = findVerdict("GCVE");

  return {
    nvd: nvd?.reason ?? "",
    osv: osv?.reason ?? "",
    gcve: gcve?.reason ?? "",
    agree,
    nvdReason: nvd?.reason ?? "",
    osvReason: osv?.reason ?? "",
    gcveReason: gcve?.reason ?? "",
    nvdAllVersions: nvd?.allVersionsRaw ?? "",
    osvAllVersions: osv?.allVersionsRaw ?? "",
    gcveAllVersions: gcve?.allVersionsRaw ?? "",
  };
}

/**
 * High-level function: given the installed version, the package name,
 * and optionally the NVD/OSV/GCVE knowledge-DB entities, produce
 * the full ComparisonResult.
 *
 * This replaces `BaseReportGenerator.getAffectedVersionsBySources()`.
 */
export function buildSourceComparison(
  installedVersion: string,
  packageName: string,
  nvdItem?: NVD,
  osvItem?: OSV,
  gcveItem?: GCVE,
): ComparisonResult {
  const verdicts: SourceVerdict[] = [];

  // NVD
  if (nvdItem) {
    let nvdEntries = extractNVDRanges(nvdItem);
    nvdEntries = filterNVDByPackage(nvdEntries, packageName);
    const merged = mergeSourceRangeData(nvdEntries);
    if (merged) {
      verdicts.push(buildSourceVerdict(installedVersion, merged));
    }
  }

  // OSV
  if (osvItem) {
    const osvEntries = extractOSVRanges(osvItem);
    const merged = mergeSourceRangeData(osvEntries);
    if (merged) {
      verdicts.push(buildSourceVerdict(installedVersion, merged));
    }
  }

  // GCVE
  if (gcveItem) {
    const gcveEntries = extractGCVERanges(gcveItem);
    const merged = mergeSourceRangeData(gcveEntries);
    if (merged) {
      verdicts.push(buildSourceVerdict(installedVersion, merged));
    }
  }

  return compareSourceVerdicts(verdicts);
}
