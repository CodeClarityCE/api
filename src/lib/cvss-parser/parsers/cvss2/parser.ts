/**
 * @author Ohlhoff Claude
 * Spec: https://www.first.org/cvss/v2/guide
 */

import {
  AccessComplexity,
  AccessVector,
  Authentication,
  CollateralDamagePotential,
  type CVSS2Info,
  Exploitability,
  Impact,
  RemediationLevel,
  ReportConfidence,
  SecurityRequirements,
  TargetDistribution,
} from "../../types/fields/cvss2";

export class CVSS2VectorParser {
  /**
   * Parse CVSS 2 Access Vector
   */
  private parseAV(part: string): AccessVector {
    switch (part) {
      case "L":
        return AccessVector.LOCAL;
      case "A":
        return AccessVector.ADJACENT_NETWORK;
      case "N":
        return AccessVector.NETWORK;
      default:
        return AccessVector.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Access Complexity
   */
  private parseAC(part: string): AccessComplexity {
    switch (part) {
      case "H":
        return AccessComplexity.HIGH;
      case "M":
        return AccessComplexity.MEDIUM;
      case "L":
        return AccessComplexity.LOW;
      default:
        return AccessComplexity.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Authentication
   */
  private parseAu(part: string): Authentication {
    switch (part) {
      case "M":
        return Authentication.MULTIPLE;
      case "S":
        return Authentication.SINGLE;
      case "N":
        return Authentication.NONE;
      default:
        return Authentication.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Confidentiality, Availability, Integrity Impact
   */
  private parseImact(part: string): Impact {
    switch (part) {
      case "N":
        return Impact.NONE;
      case "P":
        return Impact.PARTIAL;
      case "C":
        return Impact.COMPLETE;
      default:
        return Impact.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Exploitability
   */
  private parseE(part: string): Exploitability {
    switch (part) {
      case "U":
        return Exploitability.UNPROVEN;
      case "POC":
        return Exploitability.PROOF_OF_CONCEPT;
      case "F":
        return Exploitability.FUNCTIONAL;
      case "H":
        return Exploitability.HIGH;
      default:
        return Exploitability.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Remediation Level
   */
  private parseRL(part: string): RemediationLevel {
    switch (part) {
      case "OF":
        return RemediationLevel.OFFICIAL_FIX;
      case "TF":
        return RemediationLevel.TEMPORARY_FIX;
      case "W":
        return RemediationLevel.WORKAROUND;
      case "U":
        return RemediationLevel.UNAVAILABLE;
      default:
        return RemediationLevel.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Report Confidence
   */
  private parseRC(part: string): ReportConfidence {
    switch (part) {
      case "UC":
        return ReportConfidence.UNCONFIRMED;
      case "UR":
        return ReportConfidence.UNCORROBORATED;
      case "C":
        return ReportConfidence.CONFIRMED;
      default:
        return ReportConfidence.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Colleteral Damange Potential
   */
  private parseCDP(part: string): CollateralDamagePotential {
    switch (part) {
      case "N":
        return CollateralDamagePotential.NONE;
      case "L":
        return CollateralDamagePotential.LOW;
      case "LM":
        return CollateralDamagePotential.LOW_MEDIUM;
      case "MH":
        return CollateralDamagePotential.MEDIUM_HIGH;
      case "H":
        return CollateralDamagePotential.HIGH;
      default:
        return CollateralDamagePotential.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Target Distribution
   */
  private parseTD(part: string): TargetDistribution {
    switch (part) {
      case "N":
        return TargetDistribution.NONE;
      case "L":
        return TargetDistribution.LOW;
      case "M":
        return TargetDistribution.MEDIUM;
      case "H":
        return TargetDistribution.HIGH;
      default:
        return TargetDistribution.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Security Requirements (CR, IR, AR)
   */
  private parseSecurityRequirement(part: string): SecurityRequirements {
    switch (part) {
      case "L":
        return SecurityRequirements.LOW;
      case "M":
        return SecurityRequirements.MEDIUM;
      case "H":
        return SecurityRequirements.HIGH;
      default:
        return SecurityRequirements.NOT_DEFINED;
    }
  }

  /**
   * Parses a CVSS 2 vector
   * @param vector CVSS 2 vector String
   * @returns Parsed CVSS 2 Vector
   */
  public parse(vector: string): CVSS2Info {
    // Split the CVSS 2 string
    const parts = vector.split("/");

    // If the first part is the cvss version, then remove it
    if (parts[0] === "CVSS") {
      parts.shift();
    }

    const parsedVector: CVSS2Info = {
      AccessVector: AccessVector.NOT_DEFINED,
      AccessComplexity: AccessComplexity.NOT_DEFINED,
      Authentication: Authentication.NOT_DEFINED,
      ConfidentialityImpact: Impact.NOT_DEFINED,
      IntegrityImpact: Impact.NOT_DEFINED,
      AvailabilityImpact: Impact.NOT_DEFINED,
      Exploitability: Exploitability.NOT_DEFINED,
      RemediationLevel: RemediationLevel.NOT_DEFINED,
      ReportConfidence: ReportConfidence.NOT_DEFINED,
      CollateralDamagePotential: CollateralDamagePotential.NOT_DEFINED,
      TargetDistribution: TargetDistribution.NOT_DEFINED,
      ConfidentialityRequirement: SecurityRequirements.NOT_DEFINED,
      IntegrityRequirement: SecurityRequirements.NOT_DEFINED,
      AvailabilityRequirement: SecurityRequirements.NOT_DEFINED,
    };

    // Parse the cvss 2 vector parts
    for (const part of parts) {
      const partsArray = part.split(":");
      const partId = partsArray[0];
      const partValue = partsArray[1];
      if (!partValue) continue; // Skip if partValue is undefined
      switch (partId) {
        case "AV":
          parsedVector.AccessVector = this.parseAV(partValue);
          break;
        case "AC":
          parsedVector.AccessComplexity = this.parseAC(partValue);
          break;
        case "Au":
          parsedVector.Authentication = this.parseAu(partValue);
          break;
        case "C":
          parsedVector.ConfidentialityImpact = this.parseImact(partValue);
          break;
        case "I":
          parsedVector.IntegrityImpact = this.parseImact(partValue);
          break;
        case "A":
          parsedVector.AvailabilityImpact = this.parseImact(partValue);
          break;
        case "E":
          parsedVector.Exploitability = this.parseE(partValue);
          break;
        case "RL":
          parsedVector.RemediationLevel = this.parseRL(partValue);
          break;
        case "RC":
          parsedVector.ReportConfidence = this.parseRC(partValue);
          break;
        case "CDP":
          parsedVector.CollateralDamagePotential = this.parseCDP(partValue);
          break;
        case "TD":
          parsedVector.TargetDistribution = this.parseTD(partValue);
          break;
        case "CR":
          parsedVector.ConfidentialityRequirement =
            this.parseSecurityRequirement(partValue);
          break;
        case "IR":
          parsedVector.IntegrityRequirement =
            this.parseSecurityRequirement(partValue);
          break;
        case "AR":
          parsedVector.AvailabilityRequirement =
            this.parseSecurityRequirement(partValue);
          break;
        default:
          // Unknown metric, skip
          break;
      }
    }

    return parsedVector;
  }
}
