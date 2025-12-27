/**
 * @author Ohlhoff Claude
 * Spec: https://www.first.org/cvss/v3.1/specification-document
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
 * Privileges Required (PR)
 */
export enum PrivilegesRequired {
  NOT_DEFINED = "NOT_DEFINED",
  HIGH = "HIGH",
  LOW = "LOW",
  NONE = "NONE",
}

/**
 * User Interaction (UI)
 */
export enum UserInteraction {
  NOT_DEFINED = "NOT_DEFINED",
  REQUIRED = "REQUIRED",
  NONE = "NONE",
}

/**
 * Scope (S)
 */
export enum Scope {
  NOT_DEFINED = "NOT_DEFINED",
  UNCHANGED = "UNCHANGED",
  CHANGED = "CHANGED",
}

/**
 * Impact (C, A, I)
 */
export enum Impact {
  NOT_DEFINED = "NOT_DEFINED",
  NONE = "NONE",
  LOW = "LOW",
  HIGH = "HIGH",
}

/******************************************************************************/
/**                               Temporal Metrics                            */
/******************************************************************************/

/**
 * Exploit Code Maturity (E)
 */
export enum ExploitCodeMaturity {
  NOT_DEFINED = "NOT_DEFINED",
  UNPROVEN = "UNPROVEN",
  FUNCTIONAL = "FUNCTIONAL",
  PROOF_OF_CONCEPT = "PROOF_OF_CONCEPT",
  HIGH = "HIGH",
}

/**
 * Remediation Level (RL)
 */
export enum RemediationLevel {
  NOT_DEFINED = "NOT_DEFINED",
  OFFICIAL_FIX = "OFFICIAL_FIX",
  TEMPORARY_FIX = "TEMPORARY_FIX",
  WORKAROUND = "WORKAROUND",
  UNAVAILABLE = "UNAVAILABLE",
}

/**
 * Report Confidence (RC)
 */
export enum ReportConfidence {
  NOT_DEFINED = "NOT_DEFINED",
  UNKNOWN = "UNKNOWN",
  REASONABLE = "REASONABLE",
  CONFIRMED = "CONFIRMED",
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

export interface CVSS31Info {
  AttackVector: AttackVector;
  AttackComplexity: AttackComplexity;
  PrivilegesRequired: PrivilegesRequired;
  UserInteraction: UserInteraction;
  Scope: Scope;
  ConfidentialityImpact: Impact;
  IntegrityImpact: Impact;
  AvailabilityImpact: Impact;
  ExploitCodeMaturity: ExploitCodeMaturity;
  RemediationLevel: RemediationLevel;
  ReportConfidence: ReportConfidence;
  ConfidentialityRequirement: SecurityRequirements;
  IntegrityRequirement: SecurityRequirements;
  AvailabilityRequirement: SecurityRequirements;
}
