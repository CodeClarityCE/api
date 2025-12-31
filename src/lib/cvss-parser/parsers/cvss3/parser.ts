/**
 * @author Ohlhoff Claude
 * Spec: https://www.first.org/cvss/v3.0/specification-document
 */

import {
  AttackComplexity,
  AttackVector,
  type CVSS3Info,
  ExploitCodeMaturity,
  Impact,
  PrivilegesRequired,
  RemediationLevel,
  ReportConfidence,
  Scope,
  SecurityRequirements,
  UserInteraction,
} from "../../types/fields/cvss3";

export class CVSS3VectorParser {
  /**
   * Parse CVSS 3 Attack Vector
   */
  private parseAV(part: string): AttackVector {
    switch (part) {
      case "L":
        return AttackVector.LOCAL;
      case "A":
        return AttackVector.ADJACENT_NETWORK;
      case "N":
        return AttackVector.NETWORK;
      case "P":
        return AttackVector.PHYSICAL;
      default:
        return AttackVector.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 Attack Complexity
   */
  private parseAC(part: string): AttackComplexity {
    switch (part) {
      case "L":
        return AttackComplexity.LOW;
      case "H":
        return AttackComplexity.HIGH;
      default:
        return AttackComplexity.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 Privileges Required
   */
  private parsePR(part: string): PrivilegesRequired {
    switch (part) {
      case "N":
        return PrivilegesRequired.NONE;
      case "L":
        return PrivilegesRequired.LOW;
      case "H":
        return PrivilegesRequired.HIGH;
      default:
        return PrivilegesRequired.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 User Interaction
   */
  private parseUI(part: string): UserInteraction {
    switch (part) {
      case "N":
        return UserInteraction.NONE;
      case "R":
        return UserInteraction.REQUIRED;
      default:
        return UserInteraction.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 Scope
   */
  private parseS(part: string): Scope {
    switch (part) {
      case "U":
        return Scope.UNCHANGED;
      case "C":
        return Scope.CHANGED;
      default:
        return Scope.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 Confidentiality, Availability, Integrity Impact
   */
  private parseImact(part: string): Impact {
    switch (part) {
      case "N":
        return Impact.NONE;
      case "H":
        return Impact.HIGH;
      case "L":
        return Impact.LOW;
      default:
        return Impact.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 Exploit Code Maturity
   */
  private parseE(part: string): ExploitCodeMaturity {
    switch (part) {
      case "X":
        return ExploitCodeMaturity.NOT_DEFINED;
      case "H":
        return ExploitCodeMaturity.HIGH;
      case "F":
        return ExploitCodeMaturity.FUNCTIONAL;
      case "P":
        return ExploitCodeMaturity.PROOF_OF_CONCEPT;
      case "U":
        return ExploitCodeMaturity.UNPROVEN;
      default:
        return ExploitCodeMaturity.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 Exploit Code Maturity
   */
  private parseRL(part: string): RemediationLevel {
    switch (part) {
      case "X":
        return RemediationLevel.NOT_DEFINED;
      case "U":
        return RemediationLevel.UNAVAILABLE;
      case "W":
        return RemediationLevel.WORKAROUND;
      case "T":
        return RemediationLevel.TEMPORARY_FIX;
      case "O":
        return RemediationLevel.OFFICIAL_FIX;
      default:
        return RemediationLevel.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 3 Report Confidence
   */
  private parseRC(part: string): ReportConfidence {
    switch (part) {
      case "X":
        return ReportConfidence.NOT_DEFINED;
      case "C":
        return ReportConfidence.CONFIRMED;
      case "R":
        return ReportConfidence.REASONABLE;
      case "U":
        return ReportConfidence.UNKNOWN;
      default:
        return ReportConfidence.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 2 Security Requirements (CR, IR, AR)
   */
  private parseSecurityRequirement(part: string): SecurityRequirements {
    switch (part) {
      case "X":
        return SecurityRequirements.NOT_DEFINED;
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
   * Parses a CVSS 3 vector
   * @param vector CVSS 3 vector String
   * @returns Parsed CVSS 3 Vector
   */
  public parse(vector: string): CVSS3Info {
    // Split the cvss string
    const parts = vector.split("/");

    // If the first part is the cvss version, then remove it
    if (parts[0] === "CVSS") {
      parts.shift();
    }

    const parsedVector: CVSS3Info = {
      AttackVector: AttackVector.NOT_DEFINED,
      AttackComplexity: AttackComplexity.NOT_DEFINED,
      PrivilegesRequired: PrivilegesRequired.NOT_DEFINED,
      UserInteraction: UserInteraction.NOT_DEFINED,
      Scope: Scope.NOT_DEFINED,
      ConfidentialityImpact: Impact.NOT_DEFINED,
      IntegrityImpact: Impact.NOT_DEFINED,
      AvailabilityImpact: Impact.NOT_DEFINED,
      ExploitCodeMaturity: ExploitCodeMaturity.NOT_DEFINED,
      RemediationLevel: RemediationLevel.NOT_DEFINED,
      ReportConfidence: ReportConfidence.NOT_DEFINED,
      ConfidentialityRequirement: SecurityRequirements.NOT_DEFINED,
      IntegrityRequirement: SecurityRequirements.NOT_DEFINED,
      AvailabilityRequirement: SecurityRequirements.NOT_DEFINED,
    };

    // Parse the CVSS 3 vector parts
    for (const part of parts) {
      const partsArray = part.split(":");
      const partId = partsArray[0];
      const partValue = partsArray[1];
      if (!partValue) continue; // Skip if partValue is undefined
      switch (partId) {
        case "AV":
          parsedVector.AttackVector = this.parseAV(partValue);
          break;
        case "AC":
          parsedVector.AttackComplexity = this.parseAC(partValue);
          break;
        case "PR":
          parsedVector.PrivilegesRequired = this.parsePR(partValue);
          break;
        case "UI":
          parsedVector.UserInteraction = this.parseUI(partValue);
          break;
        case "S":
          parsedVector.Scope = this.parseS(partValue);
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
          parsedVector.ExploitCodeMaturity = this.parseE(partValue);
          break;
        case "RL":
          parsedVector.RemediationLevel = this.parseRL(partValue);
          break;
        case "RC":
          parsedVector.ReportConfidence = this.parseRC(partValue);
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
