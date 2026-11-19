/**
 * CVSS parsing module.
 *
 * Extracts and parses CVSS severity information from NVD and OSV entities.
 * All functions are pure (no DI / no side-effects).
 */

import type {
  CVSS2,
  CVSS3,
  CVSS4,
  CVSS31,
} from "src/codeclarity_modules/knowledge/cvss.types";
import type { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import type { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import type { SeverityInfo } from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

// ---------------------------------------------------------------------------
// JSONB shape interfaces
// ---------------------------------------------------------------------------

interface NVDCVSSData {
  vectorString: string;
  [key: string]: unknown;
}

interface NVDCVSSMetric {
  source: string;
  type?: string;
  cvssData: NVDCVSSData;
  userInteractionRequired?: boolean;
  [key: string]: unknown;
}

interface NVDMetrics {
  cvssMetricV2?: NVDCVSSMetric[];
  cvssMetricV30?: NVDCVSSMetric[];
  cvssMetricV31?: NVDCVSSMetric[];
  cvssMetricV40?: NVDCVSSMetric[];
  [key: string]: unknown;
}

interface OSVSeverity {
  type: "CVSS_V2" | "CVSS_V3" | "CVSS_V4";
  score: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Vector parsers
// ---------------------------------------------------------------------------

export async function parseCVSS31Vector(vector: string): Promise<CVSS31> {
  const { createCVSS31Parser, createCVSS31Calculator } =
    await import("../../../../lib/cvss-parser");
  const parser = createCVSS31Parser();
  const parsed = parser.parse(vector);
  const calc = createCVSS31Calculator();
  calc.computeBaseScore(parsed);

  return {
    base_score: calc.getBaseScore(true),
    exploitability_score: calc.getExploitabilitySubScore(true),
    impact_score: calc.getImpactSubScore(true),
    attack_vector: parsed.AttackVector,
    attack_complexity: parsed.AttackComplexity,
    confidentiality_impact: parsed.ConfidentialityImpact,
    availability_impact: parsed.AvailabilityImpact,
    integrity_impact: parsed.IntegrityImpact,
    user_interaction: parsed.UserInteraction,
    scope: parsed.Scope,
    privileges_required: parsed.PrivilegesRequired,
  };
}

export async function parseCVSS4Vector(vector: string): Promise<CVSS4> {
  const { createCVSS4Parser, createCVSS4Calculator } =
    await import("../../../../lib/cvss-parser");
  const parsed = createCVSS4Parser().parse(vector);
  const score = createCVSS4Calculator().computeScore(parsed);

  return {
    base_score: score,
    attack_vector: parsed.AttackVector,
    attack_complexity: parsed.AttackComplexity,
    attack_requirements: parsed.AttackRequirements,
    privileges_required: parsed.PrivilegesRequired,
    user_interaction: parsed.UserInteraction,
    confidentiality_impact_vulnerable: parsed.VulnerableConfidentialityImpact,
    integrity_impact_vulnerable: parsed.VulnerableIntegrityImpact,
    availability_impact_vulnerable: parsed.VulnerableAvailabilityImpact,
    confidentiality_impact_subsequent: parsed.SubsequentConfidentialityImpact,
    integrity_impact_subsequent: parsed.SubsequentIntegrityImpact,
    availability_impact_subsequent: parsed.SubsequentAvailabilityImpact,
    exploit_maturity: parsed.ExploitMaturity,
  };
}

export async function parseCVSS3Vector(vector: string): Promise<CVSS3> {
  const { createCVSS3Parser, createCVSS3Calculator } =
    await import("../../../../lib/cvss-parser");
  const parser = createCVSS3Parser();
  const parsed = parser.parse(vector);
  const calc = createCVSS3Calculator();
  calc.computeBaseScore(parsed);

  return {
    base_score: calc.getBaseScore(true),
    exploitability_score: calc.getExploitabilitySubScore(true),
    impact_score: calc.getImpactSubScore(true),
    attack_vector: parsed.AttackVector,
    attack_complexity: parsed.AttackComplexity,
    confidentiality_impact: parsed.ConfidentialityImpact,
    availability_impact: parsed.AvailabilityImpact,
    integrity_impact: parsed.IntegrityImpact,
    user_interaction: parsed.UserInteraction,
    scope: parsed.Scope,
    privileges_required: parsed.PrivilegesRequired,
  };
}

export async function parseCVSS2Vector(vector: string): Promise<CVSS2> {
  const { createCVSS2Parser, createCVSS2Calculator } =
    await import("../../../../lib/cvss-parser");
  const parser = createCVSS2Parser();
  const parsed = parser.parse(vector);
  const calc = createCVSS2Calculator();
  calc.computeBaseScore(parsed);

  return {
    base_score: calc.getBaseScore(true),
    exploitability_score: calc.getExploitabilitySubScore(true),
    impact_score: calc.getImpactSubScore(true),
    access_vector: parsed.AccessVector,
    access_complexity: parsed.AccessComplexity,
    confidentiality_impact: parsed.ConfidentialityImpact,
    availability_impact: parsed.AvailabilityImpact,
    integrity_impact: parsed.IntegrityImpact,
    authentication: parsed.Authentication,
  };
}

// ---------------------------------------------------------------------------
// NVD CVSS extraction
// ---------------------------------------------------------------------------

async function extractCVSS2Metric(
  cvssMetricV2: NVDCVSSMetric[],
): Promise<CVSS2 | undefined> {
  if (cvssMetricV2.length > 1) {
    for (const m of cvssMetricV2) {
      if (m.source === "nvd@nist.gov") {
        return await parseCVSS2Vector(m.cvssData.vectorString);
      }
    }
  } else if (cvssMetricV2.length === 1 && cvssMetricV2[0]) {
    return await parseCVSS2Vector(cvssMetricV2[0].cvssData.vectorString);
  }
  return undefined;
}

async function extractCVSS3Metric(
  cvssMetricV3: NVDCVSSMetric[],
): Promise<CVSS3 | undefined> {
  if (cvssMetricV3.length > 1) {
    for (const m of cvssMetricV3) {
      if (m.source === "nvd@nist.gov") {
        return await parseCVSS3Vector(m.cvssData.vectorString);
      }
    }
  } else if (cvssMetricV3.length === 1 && cvssMetricV3[0]) {
    return await parseCVSS3Vector(cvssMetricV3[0].cvssData.vectorString);
  }
  return undefined;
}

async function extractCVSS31Metric(
  cvssMetricV31: NVDCVSSMetric[],
): Promise<CVSS31 | undefined> {
  if (cvssMetricV31.length > 1) {
    for (const m of cvssMetricV31) {
      if (m.source === "nvd@nist.gov") {
        return await parseCVSS31Vector(m.cvssData.vectorString);
      }
    }
  } else if (cvssMetricV31.length === 1 && cvssMetricV31[0]) {
    return await parseCVSS31Vector(cvssMetricV31[0].cvssData.vectorString);
  }
  return undefined;
}

// NVD's primary CVSS 4.0 metric, else the first one.
async function extractCVSS4Metric(
  cvssMetricV40: NVDCVSSMetric[],
): Promise<CVSS4 | undefined> {
  const metric =
    cvssMetricV40.find((m) => m.type === "Primary") ?? cvssMetricV40[0];
  return metric
    ? await parseCVSS4Vector(metric.cvssData.vectorString)
    : undefined;
}

export async function getCVSSNVDInfo(nvdItem: NVD): Promise<SeverityInfo> {
  const severityInfo: SeverityInfo = {};

  if (!nvdItem.metrics) return severityInfo;

  const metrics = nvdItem.metrics as NVDMetrics;

  if (metrics.cvssMetricV2) {
    const cvss2 = await extractCVSS2Metric(metrics.cvssMetricV2);
    if (cvss2) severityInfo.cvss_2 = cvss2;
  }

  if (metrics.cvssMetricV30) {
    const cvss3 = await extractCVSS3Metric(metrics.cvssMetricV30);
    if (cvss3) severityInfo.cvss_3 = cvss3;
  }

  if (metrics.cvssMetricV31) {
    const cvss31 = await extractCVSS31Metric(metrics.cvssMetricV31);
    if (cvss31) severityInfo.cvss_31 = cvss31;
  }

  if (metrics.cvssMetricV40) {
    const cvss4 = await extractCVSS4Metric(metrics.cvssMetricV40);
    if (cvss4) severityInfo.cvss_4 = cvss4;
  }

  // Add user interaction required flag for CVSS v2
  if (
    severityInfo.cvss_2 !== undefined &&
    metrics.cvssMetricV2?.[0]?.userInteractionRequired !== undefined
  ) {
    severityInfo.cvss_2.user_interaction_required =
      metrics.cvssMetricV2[0].userInteractionRequired;
  }

  return severityInfo;
}

// ---------------------------------------------------------------------------
// OSV CVSS extraction
// ---------------------------------------------------------------------------

const GHSA_CLASSES: Record<string, string> = {
  LOW: "LOW",
  MODERATE: "MEDIUM",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

// GHSA's qualitative severity, with MODERATE read as MEDIUM.
function ghsaSeverity(osvItem: OSV): string | undefined {
  const specific = osvItem.database_specific as
    { severity?: unknown } | null | undefined;
  const label = specific?.severity;
  return typeof label === "string"
    ? GHSA_CLASSES[label.toUpperCase()]
    : undefined;
}

/** True when the severity info holds at least one CVSS vector. */
export function hasCvssVector(info: SeverityInfo): boolean {
  return Boolean(info.cvss_4 ?? info.cvss_31 ?? info.cvss_3 ?? info.cvss_2);
}

export async function getCVSSOSVInfo(osvItem: OSV): Promise<SeverityInfo> {
  const severityInfo: SeverityInfo = {};
  const ghsa = ghsaSeverity(osvItem);
  if (ghsa) severityInfo.ghsa = ghsa;

  const severities = (osvItem.severity ?? []) as OSVSeverity[];

  for (const severity of severities) {
    if (severity.type === "CVSS_V4") {
      severityInfo.cvss_4 = await parseCVSS4Vector(severity.score);
    } else if (severity.type === "CVSS_V3") {
      severityInfo.cvss_3 = await parseCVSS3Vector(severity.score);
    } else if (severity.type === "CVSS_V2") {
      severityInfo.cvss_2 = await parseCVSS2Vector(severity.score);
    }
  }

  return severityInfo;
}
