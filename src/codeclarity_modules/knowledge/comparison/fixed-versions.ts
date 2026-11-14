// A version without a leading "v", so "v1.2.0" and "1.2.0" compare equal.
const normalize = (version: string): string => version.replace(/^v/i, "");

// Fixed versions in FriendsOfPHP branches: each "<X" bound of a branch's constraints.
export function fixedVersions(branches: unknown): string[] {
  if (typeof branches !== "object" || branches === null) return [];
  const fixed: string[] = [];
  for (const branch of Object.values(branches as Record<string, unknown>)) {
    const versions = (branch as { versions?: unknown } | null)?.versions;
    if (!Array.isArray(versions)) continue;
    for (const constraint of versions) {
      if (typeof constraint !== "string") continue;
      for (const part of constraint.split(/[|,\s]+/)) {
        if (part.startsWith("<") && !part.startsWith("<=")) {
          fixed.push(normalize(part.slice(1)));
        }
      }
    }
  }
  return fixed;
}

interface OsvAffected {
  package?: { ecosystem?: string; name?: string };
  ranges?: { events?: { fixed?: string }[] }[];
}

// Fixed versions an OSV record gives a Packagist package, or null when it does not name it.
export function osvFixedVersions(
  affected: unknown,
  composer: string,
): string[] | null {
  if (!Array.isArray(affected)) return null;
  const entries = (affected as OsvAffected[]).filter(
    (entry) =>
      entry.package?.ecosystem === "Packagist" &&
      entry.package.name?.toLowerCase() === composer.toLowerCase(),
  );
  if (entries.length === 0) return null;
  return entries.flatMap((entry) =>
    (entry.ranges ?? []).flatMap((range) =>
      (range.events ?? [])
        .map((event) => event.fixed)
        .filter((fixed): fixed is string => typeof fixed === "string")
        .map(normalize),
    ),
  );
}
