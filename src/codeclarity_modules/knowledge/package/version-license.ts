import type { Package, Version } from "./package.entity";

/** Version extra key where the knowledge service stores a version's license expression. */
export const VERSION_LICENSE_KEY = "license_expression";

/** The version's license expression, or the package's when the version has none. */
export function versionLicense(
  pack: Pick<Package, "license"> | null | undefined,
  version: Pick<Version, "extra"> | null | undefined,
): string | undefined {
  const own = version?.extra?.[VERSION_LICENSE_KEY];
  if (typeof own === "string" && own !== "") return own;
  return pack?.license;
}
