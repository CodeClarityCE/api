import { type Dependency } from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  isCriticalSeverity,
  isHighSeverity,
  isLowSeverity,
  isMediumSeverity,
  isNoneSeverity,
} from "src/codeclarity_modules/results/utils/utils";
import {
  newVulnerabilityAnalysisStats,
  type Vulnerability,
  type VulnerabilityAnalysisStats,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

/** The finding fields the stats read; a null Severity means no severity data. */
export type StatsFinding = Pick<
  Vulnerability,
  "VulnerabilityId" | "AffectedDependency" | "AffectedVersion" | "Weaknesses"
> & {
  Severity: Pick<
    Vulnerability["Severity"],
    | "Severity"
    | "ConfidentialityImpact"
    | "IntegrityImpact"
    | "AvailabilityImpact"
  > | null;
};

/** SBOM dependency, where PHP SBOMs write lowercase role flags */
interface EnhancedDependency extends Dependency {
  direct?: boolean;
  transitive?: boolean;
}

/** Map OWASP category ID to stats property name */
const OWASP_STATS_MAP: Record<string, keyof VulnerabilityAnalysisStats> = {
  "1345": "number_of_owasp_top_10_2021_a1",
  "1346": "number_of_owasp_top_10_2021_a2",
  "1347": "number_of_owasp_top_10_2021_a3",
  "1348": "number_of_owasp_top_10_2021_a4",
  "1349": "number_of_owasp_top_10_2021_a5",
  "1352": "number_of_owasp_top_10_2021_a6",
  "1353": "number_of_owasp_top_10_2021_a7",
  "1354": "number_of_owasp_top_10_2021_a8",
  "1355": "number_of_owasp_top_10_2021_a9",
  "1356": "number_of_owasp_top_10_2021_a10",
};

/** Convert discrete CIA impact string to continuous value */
function getContinuousFromDiscreteCIA(metric: string): number {
  if (metric === "COMPLETE") return 1.0; // CVSS 2
  if (metric === "PARTIAL") return 0.5; // CVSS 2
  if (metric === "HIGH") return 1.0; // CVSS 3
  if (metric === "LOW") return 0.5; // CVSS 3
  return 0.0;
}

/**
 * Stats of a set of findings: issues, distinct vulnerabilities, vulnerable dependencies,
 * direct and transitive counts from the SBOM, severity classes and means. Diff fields stay 0.
 */
export function computeVulnerabilityStats(
  findings: StatsFinding[],
  dependencies: Record<string, Record<string, Dependency>>,
): VulnerabilityAnalysisStats {
  const stats = newVulnerabilityAnalysisStats();
  let sumSeverity = 0;
  let maxSeverity = 0;
  let sumConfidentiality = 0;
  let sumIntegrity = 0;
  let sumAvailability = 0;
  let scored = 0;
  const encounteredDeps = new Set<string>();
  const encounteredVulns = new Set<string>();

  stats.number_of_issues = findings.length;
  for (const finding of findings) {
    if (finding.Severity !== null) {
      sumConfidentiality += getContinuousFromDiscreteCIA(
        finding.Severity.ConfidentialityImpact,
      );
      sumAvailability += getContinuousFromDiscreteCIA(
        finding.Severity.AvailabilityImpact,
      );
      sumIntegrity += getContinuousFromDiscreteCIA(
        finding.Severity.IntegrityImpact,
      );
      sumSeverity += finding.Severity.Severity;
      scored += 1;
      if (finding.Severity.Severity > maxSeverity)
        maxSeverity = finding.Severity.Severity;
    }

    encounteredDeps.add(finding.AffectedDependency);

    // Only count unique vulnerabilities
    if (!encounteredVulns.has(finding.VulnerabilityId)) {
      incrementOwaspStats(stats, finding.Weaknesses);
      incrementSeverityStats(stats, finding.Severity);
    }
    encounteredVulns.add(finding.VulnerabilityId);
  }

  countDependencyRoles(stats, findings, dependencies);

  stats.number_of_vulnerable_dependencies = encounteredDeps.size;
  stats.number_of_vulnerabilities = encounteredVulns.size;
  stats.max_severity = maxSeverity;
  stats.mean_severity = scored > 0 ? sumSeverity / scored : 0;
  stats.mean_availability_impact = scored > 0 ? sumAvailability / scored : 0;
  stats.mean_confidentiality_impact =
    scored > 0 ? sumConfidentiality / scored : 0;
  stats.mean_integrity_impact = scored > 0 ? sumIntegrity / scored : 0;
  return stats;
}

/** Count each vulnerable dependency version by its role in the SBOM. */
function countDependencyRoles(
  stats: VulnerabilityAnalysisStats,
  findings: StatsFinding[],
  dependencies: Record<string, Record<string, Dependency>>,
): void {
  const counted = new Set<string>();
  for (const finding of findings) {
    const name = finding.AffectedDependency;
    const version = finding.AffectedVersion;
    const key = `${name}@${version}`;
    if (counted.has(key)) continue;
    counted.add(key);

    const dependency = dependencies[name]?.[version] as
      EnhancedDependency | undefined;
    if (!dependency) continue;
    // PHP SBOMs use lowercase keys.
    if (dependency.Direct ?? dependency.direct)
      stats.number_of_direct_vulnerabilities += 1;
    if (dependency.Transitive ?? dependency.transitive)
      stats.number_of_transitive_vulnerabilities += 1;
  }
}

/** Increment OWASP Top 10 stats based on weakness information */
function incrementOwaspStats(
  stats: VulnerabilityAnalysisStats,
  weaknesses: { OWASPTop10Id: string }[] | undefined,
): void {
  if (!weaknesses || weaknesses.length === 0) return;
  for (const weakness of weaknesses) {
    const statKey = OWASP_STATS_MAP[weakness.OWASPTop10Id];
    if (statKey) {
      stats[statKey] += 1;
    }
  }
}

/** Increment severity distribution stats based on severity value */
function incrementSeverityStats(
  stats: VulnerabilityAnalysisStats,
  severity: { Severity: number } | null | undefined,
): void {
  if (severity === null || severity === undefined) {
    stats.number_of_none += 1;
    return;
  }
  const severityValue = severity.Severity;
  if (isNoneSeverity(severityValue)) stats.number_of_none += 1;
  else if (isLowSeverity(severityValue)) stats.number_of_low += 1;
  else if (isMediumSeverity(severityValue)) stats.number_of_medium += 1;
  else if (isHighSeverity(severityValue)) stats.number_of_high += 1;
  else if (isCriticalSeverity(severityValue)) stats.number_of_critical += 1;
}
