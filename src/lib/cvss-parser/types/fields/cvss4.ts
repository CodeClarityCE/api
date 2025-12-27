/**
 * @author Ohlhoff Claude
 * @author Herzog Cédric
 * Spec: https://www.first.org/cvss/v4.0/specification-document
 */

/******************************************************************************/
/**                                 Base Metrics                              */
/******************************************************************************/

/**
 * Attack Vector (AV)
 */
export enum AttackVector {
  NOT_DEFINED = "NOT_DEFINED",
  PHYSICAL = "PHYSICAL",
  LOCAL = "LOCAL",
  ADJACENT_NETWORK = "ADJACENT_NETWORK",
  NETWORK = "NETWORK",
}

/**
 * Attack Complexity (AC)
 */
export enum AttackComplexity {
  NOT_DEFINED = "NOT_DEFINED",
  LOW = "LOW",
  HIGH = "HIGH",
}

/**
 * Attack Requirements (AT) - New in CVSS 4.0
 */
export enum AttackRequirements {
  NOT_DEFINED = "NOT_DEFINED",
  NONE = "NONE",
  PRESENT = "PRESENT",
}

/**
 * Privileges Required (PR)
 */
export enum PrivilegesRequired {
  NOT_DEFINED = "NOT_DEFINED",
  HIGH = "HIGH",
  LOW = "LOW",
  NONE = "NONE",
}

/**
 * User Interaction (UI) - Updated in CVSS 4.0 with Passive/Active
 */
export enum UserInteraction {
  NOT_DEFINED = "NOT_DEFINED",
  ACTIVE = "ACTIVE",
  PASSIVE = "PASSIVE",
  NONE = "NONE",
}

/**
 * Impact - Vulnerable System (VC, VI, VA)
 */
export enum VulnerableSystemImpact {
  NOT_DEFINED = "NOT_DEFINED",
  NONE = "NONE",
  LOW = "LOW",
  HIGH = "HIGH",
}

/**
 * Impact - Subsequent System (SC, SI, SA)
 */
export enum SubsequentSystemImpact {
  NOT_DEFINED = "NOT_DEFINED",
  NEGLIGIBLE = "NEGLIGIBLE",
  LOW = "LOW",
  HIGH = "HIGH",
}

/******************************************************************************/
/**                                Threat Metrics                             */
/******************************************************************************/

/**
 * Exploit Maturity (E)
 */
export enum ExploitMaturity {
  NOT_DEFINED = "NOT_DEFINED",
  UNREPORTED = "UNREPORTED",
  PROOF_OF_CONCEPT = "PROOF_OF_CONCEPT",
  ATTACKED = "ATTACKED",
}

/******************************************************************************/
/**                            Environmental Metrics                          */
/******************************************************************************/

/**
 * Security Requirements (CR, IR, AR)
 */
export enum SecurityRequirements {
  NOT_DEFINED = "NOT_DEFINED",
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

/**
 * Modified Subsequent System Impact (MSI, MSA) - includes Safety value
 */
export enum ModifiedSubsequentSystemImpact {
  NOT_DEFINED = "NOT_DEFINED",
  NEGLIGIBLE = "NEGLIGIBLE",
  LOW = "LOW",
  HIGH = "HIGH",
  SAFETY = "SAFETY",
}

/******************************************************************************/
/**                            Supplemental Metrics                           */
/******************************************************************************/

/**
 * Safety (S)
 */
export enum Safety {
  NOT_DEFINED = "NOT_DEFINED",
  NEGLIGIBLE = "NEGLIGIBLE",
  PRESENT = "PRESENT",
}

/**
 * Automatable (AU)
 */
export enum Automatable {
  NOT_DEFINED = "NOT_DEFINED",
  NO = "NO",
  YES = "YES",
}

/**
 * Recovery (R)
 */
export enum Recovery {
  NOT_DEFINED = "NOT_DEFINED",
  AUTOMATIC = "AUTOMATIC",
  USER = "USER",
  IRRECOVERABLE = "IRRECOVERABLE",
}

/**
 * Value Density (V)
 */
export enum ValueDensity {
  NOT_DEFINED = "NOT_DEFINED",
  DIFFUSE = "DIFFUSE",
  CONCENTRATED = "CONCENTRATED",
}

/**
 * Vulnerability Response Effort (RE)
 */
export enum ResponseEffort {
  NOT_DEFINED = "NOT_DEFINED",
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
}

/**
 * Provider Urgency (U)
 */
export enum ProviderUrgency {
  NOT_DEFINED = "NOT_DEFINED",
  CLEAR = "CLEAR",
  GREEN = "GREEN",
  AMBER = "AMBER",
  RED = "RED",
}

/******************************************************************************/
/**                                 Interface                                 */
/******************************************************************************/

export interface CVSS4Info {
  // Base Metrics - Exploitability
  AttackVector: AttackVector;
  AttackComplexity: AttackComplexity;
  AttackRequirements: AttackRequirements;
  PrivilegesRequired: PrivilegesRequired;
  UserInteraction: UserInteraction;

  // Base Metrics - Vulnerable System Impact
  VulnerableConfidentialityImpact: VulnerableSystemImpact;
  VulnerableIntegrityImpact: VulnerableSystemImpact;
  VulnerableAvailabilityImpact: VulnerableSystemImpact;

  // Base Metrics - Subsequent System Impact
  SubsequentConfidentialityImpact: SubsequentSystemImpact;
  SubsequentIntegrityImpact: SubsequentSystemImpact;
  SubsequentAvailabilityImpact: SubsequentSystemImpact;

  // Threat Metrics
  ExploitMaturity: ExploitMaturity;

  // Environmental Metrics - Security Requirements
  ConfidentialityRequirement: SecurityRequirements;
  IntegrityRequirement: SecurityRequirements;
  AvailabilityRequirement: SecurityRequirements;

  // Environmental Metrics - Modified Base Metrics
  ModifiedAttackVector: AttackVector;
  ModifiedAttackComplexity: AttackComplexity;
  ModifiedAttackRequirements: AttackRequirements;
  ModifiedPrivilegesRequired: PrivilegesRequired;
  ModifiedUserInteraction: UserInteraction;
  ModifiedVulnerableConfidentialityImpact: VulnerableSystemImpact;
  ModifiedVulnerableIntegrityImpact: VulnerableSystemImpact;
  ModifiedVulnerableAvailabilityImpact: VulnerableSystemImpact;
  ModifiedSubsequentConfidentialityImpact: SubsequentSystemImpact;
  ModifiedSubsequentIntegrityImpact: ModifiedSubsequentSystemImpact;
  ModifiedSubsequentAvailabilityImpact: ModifiedSubsequentSystemImpact;

  // Supplemental Metrics
  Safety: Safety;
  Automatable: Automatable;
  Recovery: Recovery;
  ValueDensity: ValueDensity;
  ResponseEffort: ResponseEffort;
  ProviderUrgency: ProviderUrgency;
}
