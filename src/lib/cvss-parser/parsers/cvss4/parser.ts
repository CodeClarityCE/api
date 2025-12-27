/**
 * @author Herzog Cédric
 * Spec: https://www.first.org/cvss/v4.0/specification-document
 */

import {
  type CVSS4Info,
  AttackVector,
  AttackComplexity,
  AttackRequirements,
  PrivilegesRequired,
  UserInteraction,
  VulnerableSystemImpact,
  SubsequentSystemImpact,
  ExploitMaturity,
  SecurityRequirements,
  ModifiedSubsequentSystemImpact,
  Safety,
  Automatable,
  Recovery,
  ValueDensity,
  ResponseEffort,
  ProviderUrgency,
} from "../../types/fields/cvss4";

export class CVSS4VectorParser {
  /**
   * Parse CVSS 4.0 Attack Vector
   */
  private parseAV(part: string): AttackVector {
    switch (part) {
      case "N":
        return AttackVector.NETWORK;
      case "A":
        return AttackVector.ADJACENT_NETWORK;
      case "L":
        return AttackVector.LOCAL;
      case "P":
        return AttackVector.PHYSICAL;
      default:
        return AttackVector.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Attack Complexity
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
   * Parse CVSS 4.0 Attack Requirements
   */
  private parseAT(part: string): AttackRequirements {
    switch (part) {
      case "N":
        return AttackRequirements.NONE;
      case "P":
        return AttackRequirements.PRESENT;
      default:
        return AttackRequirements.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Privileges Required
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
   * Parse CVSS 4.0 User Interaction
   */
  private parseUI(part: string): UserInteraction {
    switch (part) {
      case "N":
        return UserInteraction.NONE;
      case "P":
        return UserInteraction.PASSIVE;
      case "A":
        return UserInteraction.ACTIVE;
      default:
        return UserInteraction.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Vulnerable System Impact (VC, VI, VA)
   */
  private parseVulnerableImpact(part: string): VulnerableSystemImpact {
    switch (part) {
      case "N":
        return VulnerableSystemImpact.NONE;
      case "L":
        return VulnerableSystemImpact.LOW;
      case "H":
        return VulnerableSystemImpact.HIGH;
      default:
        return VulnerableSystemImpact.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Subsequent System Impact (SC, SI, SA)
   */
  private parseSubsequentImpact(part: string): SubsequentSystemImpact {
    switch (part) {
      case "N":
        return SubsequentSystemImpact.NEGLIGIBLE;
      case "L":
        return SubsequentSystemImpact.LOW;
      case "H":
        return SubsequentSystemImpact.HIGH;
      default:
        return SubsequentSystemImpact.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Exploit Maturity
   */
  private parseE(part: string): ExploitMaturity {
    switch (part) {
      case "X":
        return ExploitMaturity.NOT_DEFINED;
      case "A":
        return ExploitMaturity.ATTACKED;
      case "P":
        return ExploitMaturity.PROOF_OF_CONCEPT;
      case "U":
        return ExploitMaturity.UNREPORTED;
      default:
        return ExploitMaturity.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Security Requirements (CR, IR, AR)
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
   * Parse CVSS 4.0 Modified Subsequent System Impact (MSI, MSA) - includes Safety value
   */
  private parseModifiedSubsequentImpact(
    part: string,
  ): ModifiedSubsequentSystemImpact {
    switch (part) {
      case "X":
        return ModifiedSubsequentSystemImpact.NOT_DEFINED;
      case "N":
        return ModifiedSubsequentSystemImpact.NEGLIGIBLE;
      case "L":
        return ModifiedSubsequentSystemImpact.LOW;
      case "H":
        return ModifiedSubsequentSystemImpact.HIGH;
      case "S":
        return ModifiedSubsequentSystemImpact.SAFETY;
      default:
        return ModifiedSubsequentSystemImpact.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Safety (Supplemental)
   */
  private parseSafety(part: string): Safety {
    switch (part) {
      case "X":
        return Safety.NOT_DEFINED;
      case "N":
        return Safety.NEGLIGIBLE;
      case "P":
        return Safety.PRESENT;
      default:
        return Safety.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Automatable (Supplemental)
   */
  private parseAutomatable(part: string): Automatable {
    switch (part) {
      case "X":
        return Automatable.NOT_DEFINED;
      case "N":
        return Automatable.NO;
      case "Y":
        return Automatable.YES;
      default:
        return Automatable.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Recovery (Supplemental)
   */
  private parseRecovery(part: string): Recovery {
    switch (part) {
      case "X":
        return Recovery.NOT_DEFINED;
      case "A":
        return Recovery.AUTOMATIC;
      case "U":
        return Recovery.USER;
      case "I":
        return Recovery.IRRECOVERABLE;
      default:
        return Recovery.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Value Density (Supplemental)
   */
  private parseValueDensity(part: string): ValueDensity {
    switch (part) {
      case "X":
        return ValueDensity.NOT_DEFINED;
      case "D":
        return ValueDensity.DIFFUSE;
      case "C":
        return ValueDensity.CONCENTRATED;
      default:
        return ValueDensity.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Response Effort (Supplemental)
   */
  private parseResponseEffort(part: string): ResponseEffort {
    switch (part) {
      case "X":
        return ResponseEffort.NOT_DEFINED;
      case "L":
        return ResponseEffort.LOW;
      case "M":
        return ResponseEffort.MODERATE;
      case "H":
        return ResponseEffort.HIGH;
      default:
        return ResponseEffort.NOT_DEFINED;
    }
  }

  /**
   * Parse CVSS 4.0 Provider Urgency (Supplemental)
   */
  private parseProviderUrgency(part: string): ProviderUrgency {
    switch (part) {
      case "X":
        return ProviderUrgency.NOT_DEFINED;
      case "Clear":
        return ProviderUrgency.CLEAR;
      case "Green":
        return ProviderUrgency.GREEN;
      case "Amber":
        return ProviderUrgency.AMBER;
      case "Red":
        return ProviderUrgency.RED;
      default:
        return ProviderUrgency.NOT_DEFINED;
    }
  }

  /**
   * Creates the default CVSS4Info object with all metrics set to NOT_DEFINED
   */
  private createDefaultVector(): CVSS4Info {
    return {
      // Base Metrics - Exploitability
      AttackVector: AttackVector.NOT_DEFINED,
      AttackComplexity: AttackComplexity.NOT_DEFINED,
      AttackRequirements: AttackRequirements.NOT_DEFINED,
      PrivilegesRequired: PrivilegesRequired.NOT_DEFINED,
      UserInteraction: UserInteraction.NOT_DEFINED,

      // Base Metrics - Vulnerable System Impact
      VulnerableConfidentialityImpact: VulnerableSystemImpact.NOT_DEFINED,
      VulnerableIntegrityImpact: VulnerableSystemImpact.NOT_DEFINED,
      VulnerableAvailabilityImpact: VulnerableSystemImpact.NOT_DEFINED,

      // Base Metrics - Subsequent System Impact
      SubsequentConfidentialityImpact: SubsequentSystemImpact.NOT_DEFINED,
      SubsequentIntegrityImpact: SubsequentSystemImpact.NOT_DEFINED,
      SubsequentAvailabilityImpact: SubsequentSystemImpact.NOT_DEFINED,

      // Threat Metrics
      ExploitMaturity: ExploitMaturity.NOT_DEFINED,

      // Environmental Metrics - Security Requirements
      ConfidentialityRequirement: SecurityRequirements.NOT_DEFINED,
      IntegrityRequirement: SecurityRequirements.NOT_DEFINED,
      AvailabilityRequirement: SecurityRequirements.NOT_DEFINED,

      // Environmental Metrics - Modified Base Metrics
      ModifiedAttackVector: AttackVector.NOT_DEFINED,
      ModifiedAttackComplexity: AttackComplexity.NOT_DEFINED,
      ModifiedAttackRequirements: AttackRequirements.NOT_DEFINED,
      ModifiedPrivilegesRequired: PrivilegesRequired.NOT_DEFINED,
      ModifiedUserInteraction: UserInteraction.NOT_DEFINED,
      ModifiedVulnerableConfidentialityImpact:
        VulnerableSystemImpact.NOT_DEFINED,
      ModifiedVulnerableIntegrityImpact: VulnerableSystemImpact.NOT_DEFINED,
      ModifiedVulnerableAvailabilityImpact: VulnerableSystemImpact.NOT_DEFINED,
      ModifiedSubsequentConfidentialityImpact:
        SubsequentSystemImpact.NOT_DEFINED,
      ModifiedSubsequentIntegrityImpact:
        ModifiedSubsequentSystemImpact.NOT_DEFINED,
      ModifiedSubsequentAvailabilityImpact:
        ModifiedSubsequentSystemImpact.NOT_DEFINED,

      // Supplemental Metrics
      Safety: Safety.NOT_DEFINED,
      Automatable: Automatable.NOT_DEFINED,
      Recovery: Recovery.NOT_DEFINED,
      ValueDensity: ValueDensity.NOT_DEFINED,
      ResponseEffort: ResponseEffort.NOT_DEFINED,
      ProviderUrgency: ProviderUrgency.NOT_DEFINED,
    };
  }

  /**
   * Applies a parsed metric value to the vector
   */
  private applyMetric(
    parsedVector: CVSS4Info,
    metricId: string,
    value: string,
  ): void {
    // Metric mapping: metricId -> [property, parser]
    const metricHandlers: Record<string, () => void> = {
      // Base Metrics - Exploitability
      AV: () => {
        parsedVector.AttackVector = this.parseAV(value);
      },
      AC: () => {
        parsedVector.AttackComplexity = this.parseAC(value);
      },
      AT: () => {
        parsedVector.AttackRequirements = this.parseAT(value);
      },
      PR: () => {
        parsedVector.PrivilegesRequired = this.parsePR(value);
      },
      UI: () => {
        parsedVector.UserInteraction = this.parseUI(value);
      },
      // Base Metrics - Vulnerable System Impact
      VC: () => {
        parsedVector.VulnerableConfidentialityImpact =
          this.parseVulnerableImpact(value);
      },
      VI: () => {
        parsedVector.VulnerableIntegrityImpact =
          this.parseVulnerableImpact(value);
      },
      VA: () => {
        parsedVector.VulnerableAvailabilityImpact =
          this.parseVulnerableImpact(value);
      },
      // Base Metrics - Subsequent System Impact
      SC: () => {
        parsedVector.SubsequentConfidentialityImpact =
          this.parseSubsequentImpact(value);
      },
      SI: () => {
        parsedVector.SubsequentIntegrityImpact =
          this.parseSubsequentImpact(value);
      },
      SA: () => {
        parsedVector.SubsequentAvailabilityImpact =
          this.parseSubsequentImpact(value);
      },
      // Threat Metrics
      E: () => {
        parsedVector.ExploitMaturity = this.parseE(value);
      },
      // Environmental Metrics - Security Requirements
      CR: () => {
        parsedVector.ConfidentialityRequirement =
          this.parseSecurityRequirement(value);
      },
      IR: () => {
        parsedVector.IntegrityRequirement =
          this.parseSecurityRequirement(value);
      },
      AR: () => {
        parsedVector.AvailabilityRequirement =
          this.parseSecurityRequirement(value);
      },
      // Environmental Metrics - Modified Base Metrics
      MAV: () => {
        parsedVector.ModifiedAttackVector = this.parseAV(value);
      },
      MAC: () => {
        parsedVector.ModifiedAttackComplexity = this.parseAC(value);
      },
      MAT: () => {
        parsedVector.ModifiedAttackRequirements = this.parseAT(value);
      },
      MPR: () => {
        parsedVector.ModifiedPrivilegesRequired = this.parsePR(value);
      },
      MUI: () => {
        parsedVector.ModifiedUserInteraction = this.parseUI(value);
      },
      MVC: () => {
        parsedVector.ModifiedVulnerableConfidentialityImpact =
          this.parseVulnerableImpact(value);
      },
      MVI: () => {
        parsedVector.ModifiedVulnerableIntegrityImpact =
          this.parseVulnerableImpact(value);
      },
      MVA: () => {
        parsedVector.ModifiedVulnerableAvailabilityImpact =
          this.parseVulnerableImpact(value);
      },
      MSC: () => {
        parsedVector.ModifiedSubsequentConfidentialityImpact =
          this.parseSubsequentImpact(value);
      },
      MSI: () => {
        parsedVector.ModifiedSubsequentIntegrityImpact =
          this.parseModifiedSubsequentImpact(value);
      },
      MSA: () => {
        parsedVector.ModifiedSubsequentAvailabilityImpact =
          this.parseModifiedSubsequentImpact(value);
      },
      // Supplemental Metrics
      S: () => {
        parsedVector.Safety = this.parseSafety(value);
      },
      AU: () => {
        parsedVector.Automatable = this.parseAutomatable(value);
      },
      R: () => {
        parsedVector.Recovery = this.parseRecovery(value);
      },
      V: () => {
        parsedVector.ValueDensity = this.parseValueDensity(value);
      },
      RE: () => {
        parsedVector.ResponseEffort = this.parseResponseEffort(value);
      },
      U: () => {
        parsedVector.ProviderUrgency = this.parseProviderUrgency(value);
      },
    };

    const handler = metricHandlers[metricId];
    if (handler) {
      handler();
    }
  }

  /**
   * Parses a CVSS 4.0 vector
   * @param vector CVSS 4.0 vector String (e.g., "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H")
   * @returns Parsed CVSS 4.0 Vector
   */
  public parse(vector: string): CVSS4Info {
    // Split the cvss string
    const parts = vector.split("/");

    // If the first part is the cvss version identifier, remove it
    if (parts[0] === "CVSS:4.0") {
      parts.shift();
    }

    const parsedVector = this.createDefaultVector();

    // Parse the CVSS 4.0 vector parts
    for (const part of parts) {
      const partsArray = part.split(":");
      const partId = partsArray[0];
      const partValue = partsArray[1];
      if (!partId || !partValue) continue;

      this.applyMetric(parsedVector, partId, partValue);
    }

    return parsedVector;
  }
}
