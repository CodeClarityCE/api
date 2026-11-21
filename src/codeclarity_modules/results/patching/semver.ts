import type { SemVer } from "./patching.types";

/** A plugin semver as text, such as "1.2.3" or "1.2.3-beta". */
export function semverString(version: SemVer): string {
  const base = `${version.Major}.${version.Minor}.${version.Patch}`;
  return version.PreReleaseTag ? `${base}-${version.PreReleaseTag}` : base;
}

/** Negative when `a` is older than `b`; a pre-release is older than its release. */
export function compareSemver(a: SemVer, b: SemVer): number {
  return (
    a.Major - b.Major ||
    a.Minor - b.Minor ||
    a.Patch - b.Patch ||
    Number(!a.PreReleaseTag) - Number(!b.PreReleaseTag) ||
    a.PreReleaseTag.localeCompare(b.PreReleaseTag, undefined, {
      numeric: true,
    })
  );
}

/** True for a well-formed semver that is not the plugins' empty "0.0.0". */
export function isSemver(value: unknown): value is SemVer {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<SemVer>;
  if (![v.Major, v.Minor, v.Patch].every((n) => typeof n === "number")) {
    return false;
  }
  return (
    v.Major !== 0 || v.Minor !== 0 || v.Patch !== 0 || Boolean(v.PreReleaseTag)
  );
}
