import {
  type AffectedPackage,
  ecosystemOf,
} from "src/codeclarity_modules/knowledge/osv/affected-package";
import type { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import type { OSVRepository } from "src/codeclarity_modules/knowledge/osv/osv.repository";
import type { KnowledgeLookupOptions } from "src/codeclarity_modules/knowledge/retired-records";

/** What a finding says about its OSV advisory. */
export interface FindingAdvisoryQuery {
  vulnerabilityId: string;
  affectedDependency: string;
  packageManager?: string | null | undefined;
  // The vuln-finder's OSV match, whose Vulnerability holds the matched record.
  osvMatch?: { Vulnerability?: unknown } | null | undefined;
}

/** OSV id of the record the vuln-finder matched, if it names one. */
function sourceMatchOsvId(
  osvMatch: FindingAdvisoryQuery["osvMatch"],
): string | undefined {
  const matched = osvMatch?.Vulnerability;
  if (!matched || typeof matched !== "object" || !("id" in matched)) {
    return undefined;
  }
  const { id } = matched;
  return typeof id === "string" && id !== "" ? id : undefined;
}

/** The finding's package as OSV names it; null for framework findings, which name none. */
export function affectedPackageOf(
  affectedDependency: string,
  packageManager: string | null | undefined,
): AffectedPackage | null {
  if (!affectedDependency || affectedDependency.startsWith("framework-")) {
    return null;
  }
  return { name: affectedDependency, ecosystem: ecosystemOf(packageManager) };
}

/**
 * The OSV advisory for a finding: the record its source match names, else
 * the record for its CVE that affects its package.
 */
export async function findFindingAdvisory(
  osvRepository: OSVRepository,
  query: FindingAdvisoryQuery,
  options?: KnowledgeLookupOptions,
): Promise<OSV | null> {
  const matchedId = sourceMatchOsvId(query.osvMatch);
  if (matchedId) {
    const matched = await osvRepository.getVulnByOSVIDWithoutFailing(
      matchedId,
      options,
    );
    if (matched) return matched;
  }

  if (!query.vulnerabilityId.startsWith("CVE")) {
    return osvRepository.getVulnByOSVIDWithoutFailing(
      query.vulnerabilityId,
      options,
    );
  }

  return osvRepository.getVulnByCVEIDWithoutFailing(
    query.vulnerabilityId,
    affectedPackageOf(query.affectedDependency, query.packageManager),
    options,
  );
}
