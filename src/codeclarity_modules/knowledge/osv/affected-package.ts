/** The package a finding is about, as OSV names it. */
export interface AffectedPackage {
  name: string;
  // OSV ecosystem, such as "npm" or "Packagist"; unknown matches by name only.
  ecosystem?: string | undefined;
}

interface OSVAffectedEntry {
  package?: { name?: string; ecosystem?: string };
}

const ECOSYSTEM_BY_PACKAGE_MANAGER: Record<string, string> = {
  npm: "npm",
  yarn: "npm",
  pnpm: "npm",
  bun: "npm",
  composer: "Packagist",
  pip: "PyPI",
};

/** OSV ecosystem of an analysis's package manager, if known. */
export function ecosystemOf(
  packageManager: string | null | undefined,
): string | undefined {
  if (!packageManager) return undefined;
  return ECOSYSTEM_BY_PACKAGE_MANAGER[packageManager.toLowerCase()];
}

/** Whether an OSV "affected" entry names the package. */
function entryAffectsPackage(
  entry: OSVAffectedEntry,
  pkg: AffectedPackage,
): boolean {
  const named = entry.package;
  if (named?.name !== pkg.name) return false;
  if (!pkg.ecosystem) return true;
  // Ecosystems can carry a suffix, as in "Packagist:https://packages.drupal.org/8".
  const ecosystem = named.ecosystem ?? "";
  return (
    ecosystem === pkg.ecosystem || ecosystem.startsWith(`${pkg.ecosystem}:`)
  );
}

/** Whether an OSV record's "affected" list names the package. */
export function affectsPackage(
  affected: unknown,
  pkg: AffectedPackage,
): boolean {
  if (!Array.isArray(affected)) return false;
  return (affected as OSVAffectedEntry[]).some((entry) =>
    entryAffectsPackage(entry, pkg),
  );
}
