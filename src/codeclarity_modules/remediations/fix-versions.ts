import { coerce, compare, parse, type SemVer } from "semver";

import type { VersionRange } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";

// A version without a leading "v", loosely parsed, or null when it has no numbers.
const version = (value: string): SemVer | null =>
  parse(value.replace(/^v/i, ""), { loose: true }) ?? coerce(value);

/** Negative when `a` is older than `b`; versions that do not parse sort as text. */
export function compareVersions(a: string, b: string): number {
  const left = version(a);
  const right = version(b);
  if (left && right) return compare(left, right);
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * True when `candidate` stays in the current major of `installed`, as npm's
 * caret reads it: 0.x minors and 0.0.x patches count as majors.
 */
export function inCurrentMajor(installed: string, candidate: string): boolean {
  const from = version(installed);
  const to = version(candidate);
  if (!from || from.major !== to?.major) return false;
  if (from.major > 0) return true;
  if (from.minor !== to.minor) return false;
  return from.minor > 0 || from.patch === to.patch;
}

// True when the range covers `value`; "0" or null as introduced means every earlier version.
function inRange(value: string, range: VersionRange): boolean {
  const { introduced, fixed, last_affected } = range;
  if (
    introduced &&
    introduced !== "0" &&
    compareVersions(value, introduced) < 0
  )
    return false;
  if (fixed) return compareVersions(value, fixed) < 0;
  if (last_affected) return compareVersions(value, last_affected) <= 0;
  return true;
}

/** True when any of the ranges covers `value`. */
export function covered(value: string, ranges: VersionRange[]): boolean {
  return ranges.some((range) => inRange(value, range));
}

/** The fixed versions the ranges name, plus the one the instance stored. */
export function fixCandidates(
  ranges: VersionRange[],
  storedFix: string | null,
): string[] {
  const candidates = ranges
    .map((r) => r.fixed)
    .filter((v): v is string => Boolean(v));
  return storedFix ? [...candidates, storedFix] : candidates;
}

/**
 * The candidates newer than `installed` that none of `rangeSets` covers,
 * oldest first. Pre-releases count only when the installed version is one.
 */
export function fixesAbove(
  installed: string,
  candidates: string[],
  rangeSets: VersionRange[][],
): string[] {
  const prerelease = Boolean(version(installed)?.prerelease.length);
  return [...new Set(candidates)]
    .filter((c) => {
      const parsed = version(c);
      return parsed !== null && (prerelease || !parsed.prerelease.length);
    })
    .filter((c) => compareVersions(c, installed) > 0)
    .filter((c) => !rangeSets.some((set) => covered(c, set)))
    .sort(compareVersions);
}

/**
 * The smallest fixed version above `installed` that no range covers; null when none is known.
 * Later majors are larger, so it stays in the current major when that major has a fix.
 */
export function smallestFix(
  installed: string,
  ranges: VersionRange[],
  storedFix: string | null,
): string | null {
  return (
    fixesAbove(installed, fixCandidates(ranges, storedFix), [ranges])[0] ?? null
  );
}

/** The newest of the versions. */
export function newest(versions: string[]): string {
  return [...versions].sort(compareVersions).at(-1)!;
}
