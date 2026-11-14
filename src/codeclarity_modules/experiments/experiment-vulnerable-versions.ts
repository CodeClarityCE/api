/**
 * Which versions of a package an advisory affects, as vuln-finder matched
 * them, so a version seen only in an SBOM (a fix probe) can be tested later.
 * Pure: no Nest or TypeORM imports.
 */
import { eq, gte, lt, valid } from "semver";

/** introduced <= version < fixed; a null bound is open. */
export interface VulnerableRange {
  introduced: string | null;
  fixed: string | null;
}

export interface VulnerableVersions {
  ranges: VulnerableRange[];
  exact: string[];
  /** Every version is affected */
  universal: boolean;
}

/**
 * Whether a version is affected, mirroring vuln-finder's matcher: universal,
 * an exact version, or inside a range with at least one bound. Null when no
 * affected versions were stored.
 */
export function isVulnerableVersion(
  version: string,
  versions: VulnerableVersions | null,
): boolean | null {
  if (versions === null) return null;
  if (versions.universal) return true;
  const v = valid(version, { loose: true });
  if (v === null) return false;
  if (
    versions.exact.some(
      (exact) => valid(exact, { loose: true }) && eq(v, exact, { loose: true }),
    )
  ) {
    return true;
  }
  return versions.ranges.some(({ introduced, fixed }) => {
    if (introduced === null && fixed === null) return false;
    const above = introduced === null || gte(v, introduced, { loose: true });
    const below = fixed === null || lt(v, fixed, { loose: true });
    return above && below;
  });
}
