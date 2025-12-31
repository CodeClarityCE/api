/**
 * @author Ohlhoff Claude
 * Spec: https://www.first.org/cvss/v3.1/specification-document
 */

import {
  AttackComplexity,
  AttackVector,
  type CVSS31Info,
  ExploitCodeMaturity,
  Impact,
  PrivilegesRequired,
  RemediationLevel,
  ReportConfidence,
  Scope,
  SecurityRequirements,
  UserInteraction,
} from "../../types/fields/cvss31";
import { roundUp } from "../../utils/utils";

export class CVSS31Calculator {
  baseScore = 0;
  impactSubScore = 0;
  exploitabilitySubScore = 0;
  temporalScore = 0;
  environmentalScore = 0;

  cvss3Info: CVSS31Info = {
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

  /******************************************************************************/
  /**                             Public Methods                                */
  /******************************************************************************/

  /**
   * Compute the CVSS 3 base score from the parsed CVSS 2 Vector
   * @param cvss3Info the parsed CVSS 3 Vector
   * @returns the base score
   */
  public computeBaseScore(cvss3Info: CVSS31Info): number {
    this.cvss3Info = cvss3Info;

    const impactSubScore = this.computeImpactSubScore();
    const exploitabilitySubScore = this.computeExploitabilitySubScore();

    if (impactSubScore <= 0) return 0.0;

    let baseScore = 0.0;

    if (Scope.UNCHANGED) {
      baseScore = Math.min(impactSubScore + exploitabilitySubScore, 10);
    } else if (Scope.CHANGED) {
      baseScore = Math.min(
        1.08 * (impactSubScore + exploitabilitySubScore),
        10,
      );
    }

    this.baseScore = baseScore;
    return this.baseScore;
  }

  /**
   * Compute the CVSS 3 temporal score from the parsed CVSS 3 Vector
   * @param cvss3Info the parsed CVSS 3 Vector
   * @returns the temporal score
   */
  public computeTemporalScore(cvss3Info: CVSS31Info): number {
    this.cvss3Info = cvss3Info;

    if (this.baseScore === undefined) {
      this.computeBaseScore(cvss3Info);
    }

    const exploitCodeMaturity = this.computeExploitCodeMaturity();
    const remediationLevel = this.computeRemediationLevel();
    const reportConfidence = this.computeReportConfidence();

    const temporalScore = roundUp(
      this.baseScore *
        exploitCodeMaturity *
        remediationLevel *
        reportConfidence,
    );
    this.temporalScore = temporalScore;
    return temporalScore;
  }

  /**
   * Compute the CVSS 3 environmental score from the parsed CVSS 3 Vector
   * @param cvss3Info the parsed CVSS 3 Vector
   * @returns the temporal score
   */
  public computeEnvironmentalScore(cvss3Info: CVSS31Info): number {
    this.cvss3Info = cvss3Info;

    const modifiedImpactSubScore = this.computeModifiedImpactSubScore();
    const modifiedExploitabilitySubScore =
      this.computeModifiedExploitabilitySubScore();
    const exploitCodeMaturity = this.computeExploitCodeMaturity();
    const remediationLevel = this.computeRemediationLevel();
    const reportConfidence = this.computeRemediationLevel();

    if (modifiedImpactSubScore <= 0) return 0.0;

    let environmentalScore = 0.0;

    if (this.cvss3Info.Scope === Scope.UNCHANGED) {
      environmentalScore = roundUp(
        roundUp(
          Math.min(
            modifiedImpactSubScore + modifiedExploitabilitySubScore,
            10.0,
          ),
        ) *
          exploitCodeMaturity *
          remediationLevel *
          reportConfidence,
      );
    } else if (this.cvss3Info.Scope === Scope.CHANGED) {
      environmentalScore = roundUp(
        roundUp(
          Math.min(
            1.08 * (modifiedImpactSubScore + modifiedExploitabilitySubScore),
            10.0,
          ),
        ) *
          exploitCodeMaturity *
          remediationLevel *
          reportConfidence,
      );
    }

    this.environmentalScore = environmentalScore;
    return environmentalScore;
  }

  /**
   * Returns the base score
   * @param roundUpVal Whether or not to round up the floating point value up to its nearest multiple of 0.1 (i.e. to one decimal place).
   * @returns the base score
   */
  public getBaseScore(roundUpVal: boolean): number {
    if (roundUpVal) return roundUp(this.baseScore);
    return this.baseScore;
  }

  /**
   * Returns the temporal score
   * @param roundUpVal Whether or not to round up the floating point value up to its nearest multiple of 0.1 (i.e. to one decimal place).
   * @returns the temporal score
   */
  public getTemporalScore(roundUpVal: boolean): number {
    if (roundUpVal) return roundUp(this.temporalScore);
    return this.temporalScore;
  }

  /**
   * Returns the environmental score
   * @param roundUpVal Whether or not to round up the floating point value up to its nearest multiple of 0.1 (i.e. to one decimal place).
   * @returns the environmental score
   */
  public getEnvironmentalScore(roundUpVal: boolean): number {
    if (roundUpVal) return roundUp(this.environmentalScore);
    return this.environmentalScore;
  }

  /**
   * Returns the impact subscore
   * @param roundUpVal Whether or not to round up the floating point value up to its nearest multiple of 0.1 (i.e. to one decimal place).
   * @returns the impact subscore
   */
  public getImpactSubScore(roundUpVal: boolean): number {
    if (roundUpVal) return roundUp(this.impactSubScore);
    return this.impactSubScore;
  }

  /**
   * Returns the exploitability subscore
   * @param roundUpVal Whether or not to round up the floating point value up to its nearest multiple of 0.1 (i.e. to one decimal place).
   * @returns the exploitability subscore
   */
  public getExploitabilitySubScore(roundUpVal: boolean): number {
    if (roundUpVal) return roundUp(this.exploitabilitySubScore);
    return this.exploitabilitySubScore;
  }

  /******************************************************************************/
  /**                          Base Score calculation                           */
  /******************************************************************************/

  private computeExploitabilitySubScore(): number {
    const attackVector = this.computeAttackVector();
    const attackComplexity = this.computeAttackComplexity();
    const privilegesRequired = this.computePrivilegesRequired();
    const userInteraction = this.computeUserInteraction();

    const exploitabilitySubScore =
      8.22 *
      attackVector *
      attackComplexity *
      privilegesRequired *
      userInteraction;
    this.exploitabilitySubScore = exploitabilitySubScore;

    return exploitabilitySubScore;
  }

  private computeImpactSubScore(): number {
    const baseImpactScore = this.computeBaseImpactSubScore();

    if (this.cvss3Info.Scope === Scope.UNCHANGED) {
      const impactSubScore = 6.42 * baseImpactScore;
      this.impactSubScore = impactSubScore;
      return impactSubScore;
    }

    const impactSubScore =
      7.52 * (baseImpactScore - 0.029) -
      3.25 * Math.pow(baseImpactScore - 0.02, 15);
    this.impactSubScore = impactSubScore;

    return impactSubScore;
  }

  private computeBaseImpactSubScore(): number {
    const confidentialityImpact = this.computeConfidentialityImpact();
    const integrityImpact = this.computeIntegrityImpact();
    const availabilityImpact = this.computeAvailabilityImpact();

    // Compute and return the base impact subscore (called ISC_Base) in the specification.
    return (
      1 -
      (1 - confidentialityImpact) *
        (1 - integrityImpact) *
        (1 - availabilityImpact)
    );
  }

  private computeConfidentialityImpact(): number {
    switch (this.cvss3Info.ConfidentialityImpact) {
      case Impact.NONE:
        return 0.0;
      case Impact.LOW:
        return 0.22;
      case Impact.HIGH:
        return 0.56;
      default:
        return 0.0;
    }
  }

  private computeIntegrityImpact(): number {
    switch (this.cvss3Info.IntegrityImpact) {
      case Impact.NONE:
        return 0.0;
      case Impact.LOW:
        return 0.22;
      case Impact.HIGH:
        return 0.56;
      default:
        return 0.0;
    }
  }

  private computeAvailabilityImpact(): number {
    switch (this.cvss3Info.AvailabilityImpact) {
      case Impact.NONE:
        return 0.0;
      case Impact.LOW:
        return 0.22;
      case Impact.HIGH:
        return 0.56;
      default:
        return 0.0;
    }
  }

  private computeAttackVector(): number {
    switch (this.cvss3Info.AttackVector) {
      case AttackVector.NETWORK:
        return 0.85;
      case AttackVector.ADJACENT_NETWORK:
        return 0.62;
      case AttackVector.LOCAL:
        return 0.55;
      case AttackVector.PHYSICAL:
        return 0.2;
      default:
        return 0.0;
    }
  }

  private computeAttackComplexity(): number {
    switch (this.cvss3Info.AttackComplexity) {
      case AttackComplexity.LOW:
        return 0.77;
      case AttackComplexity.HIGH:
        return 0.44;
      default:
        return 0.0;
    }
  }

  private computePrivilegesRequired(): number {
    switch (this.cvss3Info.PrivilegesRequired) {
      case PrivilegesRequired.NONE:
        return 0.85;
      case PrivilegesRequired.LOW:
        return this.cvss3Info.Scope === Scope.CHANGED ? 0.68 : 0.62;
      case PrivilegesRequired.HIGH:
        return this.cvss3Info.Scope === Scope.CHANGED ? 0.5 : 0.27;
      default:
        return 0.0;
    }
  }

  private computeUserInteraction(): number {
    switch (this.cvss3Info.UserInteraction) {
      case UserInteraction.NONE:
        return 0.85;
      case UserInteraction.REQUIRED:
        return 0.62;
      default:
        return 0.0;
    }
  }

  /******************************************************************************/
  /**                        Temporal Score calculation                         */
  /******************************************************************************/

  private computeExploitCodeMaturity(): number {
    switch (this.cvss3Info.ExploitCodeMaturity) {
      case ExploitCodeMaturity.NOT_DEFINED:
        return 1.0;
      case ExploitCodeMaturity.HIGH:
        return 1.0;
      case ExploitCodeMaturity.FUNCTIONAL:
        return 0.97;
      case ExploitCodeMaturity.PROOF_OF_CONCEPT:
        return 0.94;
      case ExploitCodeMaturity.UNPROVEN:
        return 0.91;
      default:
        return 1.0;
    }
  }

  private computeRemediationLevel(): number {
    switch (this.cvss3Info.RemediationLevel) {
      case RemediationLevel.NOT_DEFINED:
        return 1.0;
      case RemediationLevel.UNAVAILABLE:
        return 1.0;
      case RemediationLevel.WORKAROUND:
        return 0.97;
      case RemediationLevel.TEMPORARY_FIX:
        return 0.96;
      case RemediationLevel.OFFICIAL_FIX:
        return 0.95;
      default:
        return 1.0;
    }
  }

  private computeReportConfidence(): number {
    switch (this.cvss3Info.ReportConfidence) {
      case ReportConfidence.NOT_DEFINED:
        return 1.0;
      case ReportConfidence.CONFIRMED:
        return 1.0;
      case ReportConfidence.REASONABLE:
        return 0.96;
      case ReportConfidence.UNKNOWN:
        return 0.92;
      default:
        return 1.0;
    }
  }

  /******************************************************************************/
  /**                      Environmental Score calculation                      */
  /******************************************************************************/

  private computeModifiedExploitabilitySubScore(): number {
    const attackVector = this.computeAttackVector();
    const attackComplexity = this.computeAttackComplexity();
    const privilegesRequired = this.computePrivilegesRequired();
    const userInteraction = this.computeUserInteraction();

    const exploitabilitySubScore =
      8.22 *
      attackVector *
      attackComplexity *
      privilegesRequired *
      userInteraction;
    return exploitabilitySubScore;
  }

  private computeModifiedImpactSubScore(): number {
    const iscModified = this.computeIscModified();

    if (this.cvss3Info.Scope === Scope.UNCHANGED) {
      return 6.42 * iscModified;
    } else if (this.cvss3Info.Scope === Scope.CHANGED) {
      return (
        7.52 * (iscModified - 0.029) -
        3.25 * Math.pow(iscModified * 0.9731 - 0.02, 15)
      ); // this is the only line that differs from CVSS 3
    } else {
      return 0.0;
    }
  }

  private computeIscModified(): number {
    const modifiedConfidentialityImpact = this.computeConfidentialityImpact();
    const modifiedIntegrityImpact = this.computeIntegrityImpact();
    const modifiedAvailabilityImpact = this.computeAvailabilityImpact();
    const confidenialityRequirement = this.computeConfidentialityRequirement();
    const integrityRequirement = this.computeIntegrityRequirement();
    const availabilityRequirement = this.computeAvailabilityRequirement();

    const isc_modified =
      (1 - modifiedConfidentialityImpact * confidenialityRequirement) *
      (1 - modifiedIntegrityImpact * integrityRequirement) *
      (1 - modifiedAvailabilityImpact * availabilityRequirement);

    return Math.min(1 - isc_modified, 0.915);
  }

  private computeConfidentialityRequirement(): number {
    switch (this.cvss3Info.ConfidentialityRequirement) {
      case SecurityRequirements.NOT_DEFINED:
        return 1.0;
      case SecurityRequirements.HIGH:
        return 1.5;
      case SecurityRequirements.MEDIUM:
        return 1.0;
      case SecurityRequirements.LOW:
        return 0.5;
      default:
        return 1.0;
    }
  }

  private computeAvailabilityRequirement(): number {
    switch (this.cvss3Info.AvailabilityRequirement) {
      case SecurityRequirements.NOT_DEFINED:
        return 1.0;
      case SecurityRequirements.HIGH:
        return 1.5;
      case SecurityRequirements.MEDIUM:
        return 1.0;
      case SecurityRequirements.LOW:
        return 0.5;
      default:
        return 1.0;
    }
  }

  private computeIntegrityRequirement(): number {
    switch (this.cvss3Info.IntegrityRequirement) {
      case SecurityRequirements.NOT_DEFINED:
        return 1.0;
      case SecurityRequirements.HIGH:
        return 1.5;
      case SecurityRequirements.MEDIUM:
        return 1.0;
      case SecurityRequirements.LOW:
        return 0.5;
      default:
        return 1.0;
    }
  }
}
