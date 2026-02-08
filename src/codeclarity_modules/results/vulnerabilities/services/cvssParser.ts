/**
 * CVSS parsing module.
 *
 * Extracts and parses CVSS severity information from NVD and OSV entities.
 * All functions are pure (no DI / no side-effects).
 */

import type {
  CVSS2,
  CVSS3,
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
  cvssData: NVDCVSSData;
  userInteractionRequired?: boolean;
  [key: string]: unknown;
}

interface NVDMetrics {
  cvssMetricV2?: NVDCVSSMetric[];
  cvssMetricV30?: NVDCVSSMetric[];
  cvssMetricV31?: NVDCVSSMetric[];
  [key: string]: unknown;
}

interface OSVSeverity {
  type: "CVSS_V2" | "CVSS_V3";
  score: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Vector parsers
// ---------------------------------------------------------------------------

export async function parseCVSS31Vector(vector: string): Promise<CVSS31> {
  const { createCVSS31Parser, createCVSS31Calculator } = await import(
    "../../../../lib/cvss-parser"
  );
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

export async function parseCVSS3Vector(vector: string): Promise<CVSS3> {
  const { createCVSS3Parser, createCVSS3Calculator } = await import(
    "../../../../lib/cvss-parser"
  );
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
  const { createCVSS2Parser, createCVSS2Calculator } = await import(
    "../../../../lib/cvss-parser"
  );
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

export async function getCVSSOSVInfo(osvItem: OSV): Promise<SeverityInfo> {
  const severityInfo: SeverityInfo = {};

  if (!osvItem.severity) return severityInfo;

  const severities = osvItem.severity as OSVSeverity[];

  if (severities.length === 0) return severityInfo;

  for (const severity of severities) {
    if (severity.type === "CVSS_V3") {
      severityInfo.cvss_3 = await parseCVSS3Vector(severity.score);
    } else if (severity.type === "CVSS_V2") {
      severityInfo.cvss_2 = await parseCVSS2Vector(severity.score);
    }
  }

  return severityInfo;
}
