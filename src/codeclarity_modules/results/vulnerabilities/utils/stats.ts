import { type Dependency } from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  hasCvssScore,
  isWorseSeverity,
  severityBucket,
} from "src/codeclarity_modules/results/utils/utils";
import {
  newVulnerabilityAnalysisStats,
  type Vulnerability,
  type VulnerabilityAnalysisStats,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

/** The finding fields the stats read; a null Severity means no severity data. */
export type StatsFinding = Pick<
  Vulnerability,
  | "VulnerabilityId"
  | "AffectedDependency"
  | "AffectedVersion"
  | "Weaknesses"
  | "Disputed"
> & {
  Severity:
    | (Pick<
        Vulnerability["Severity"],
        | "Severity"
        | "ConfidentialityImpact"
        | "IntegrityImpact"
        | "AvailabilityImpact"
      > &
        Partial<
          Pick<Vulnerability["Severity"], "SeverityClass" | "SeverityType">
        >)
    | null;
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
    if (finding.Severity !== null && hasCvssScore(finding.Severity)) {
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
    }
    encounteredVulns.add(finding.VulnerabilityId);
  }
  for (const severity of worstSeverities(findings).values()) {
    incrementSeverityStats(stats, severity);
  }

  countDependencyRoles(stats, findings, dependencies);
  countGradeInputs(stats, findings);

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

/** Count disputed vulnerabilities, and the grade inputs without them. */
function countGradeInputs(
  stats: VulnerabilityAnalysisStats,
  findings: StatsFinding[],
): void {
  const graded = newVulnerabilityAnalysisStats();
  const disputed = new Set<string>();
  for (const finding of findings) {
    if (finding.Disputed === true) disputed.add(finding.VulnerabilityId);
  }
  const worst = worstSeverities(findings.filter((f) => f.Disputed !== true));
  for (const severity of worst.values()) {
    incrementSeverityStats(graded, severity);
  }
  stats.number_of_disputed = disputed.size;
  stats.graded_number_of_vulnerabilities = worst.size;
  stats.graded_number_of_critical = graded.number_of_critical;
  stats.graded_number_of_high = graded.number_of_high;
}

/** The worst severity of each vulnerability among its findings, as its card shows. */
function worstSeverities(
  findings: StatsFinding[],
): Map<string, StatsFinding["Severity"]> {
  const worst = new Map<string, StatsFinding["Severity"]>();
  for (const finding of findings) {
    const id = finding.VulnerabilityId;
    if (!worst.has(id) || isWorseSeverity(finding.Severity, worst.get(id))) {
      worst.set(id, finding.Severity);
    }
  }
  return worst;
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
  severity: { Severity: number; SeverityClass?: string } | null | undefined,
): void {
  const counters = {
    NONE: "number_of_none",
    LOW: "number_of_low",
    MEDIUM: "number_of_medium",
    HIGH: "number_of_high",
    CRITICAL: "number_of_critical",
  } as const;
  stats[counters[severityBucket(severity)]] += 1;
}
