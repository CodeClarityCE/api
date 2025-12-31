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
import { roundUp } from "../../utils/utils";

export class CVSS2Calculator {
  baseScore = 0;
  impactSubScore = 0;
  exploitabilitySubScore = 0;
  temporalScore = 0;
  environmentalScore = 0;

  cvss2Info: CVSS2Info = {
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

  /******************************************************************************/
  /**                             Public Methods                                */
  /******************************************************************************/

  /**
   * Compute the CVSS 2 base score from the parsed CVSS 2 Vector
   * @param cvss2Info the parsed CVSS 2 Vector
   * @returns the base score
   */
  public computeBaseScore(cvss2Info: CVSS2Info): number {
    this.cvss2Info = cvss2Info;
    const impact = this.computeImpactSubscore();
    const exploitability = this.computeExploitabilitySubscore();
    const fImpact = impact === 0 ? 0 : 1.176;

    const baseScore = (0.6 * impact + 0.4 * exploitability - 1.5) * fImpact;
    this.baseScore = baseScore;
    return baseScore;
  }

  /**
   * Compute the CVSS 2 temporal score from the parsed CVSS 2 Vector
   * @param cvss2Info the parsed CVSS 2 Vector
   * @returns the temporal score
   */
  public computeTemporalScore(cvss2Info: CVSS2Info): number {
    this.cvss2Info = cvss2Info;

    if (this.baseScore === undefined) {
      this.computeBaseScore(cvss2Info);
    }

    const exploitability = this.computeExploitability();
    const remediationLevel = this.computeRemediationLevel();
    const reportConfidence = this.computeReportConfidence();

    const temporalScore = roundUp(
      this.baseScore * exploitability * remediationLevel * reportConfidence,
    );
    this.temporalScore = temporalScore;

    return temporalScore;
  }

  /**
   * Compute the CVSS 2 environmental score from the parsed CVSS 2 Vector
   * @param cvss2Info the parsed CVSS 2 Vector
   * @returns the temporal score
   */
  public computeEnvironmentalScore(cvss2Info: CVSS2Info): number {
    this.cvss2Info = cvss2Info;

    const collateralDamagePotential = this.computeCollateralDamangePotential();
    const targetDistribution = this.computeTargetDistribution();
    const adjustedTemporal = this.computeAdjustedTemportalScore();
    const environmentalScore = roundUp(
      (adjustedTemporal + (10 - adjustedTemporal) * collateralDamagePotential) *
        targetDistribution,
    );
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

  /**
   * Compute the CVSS 2 Impact Subscore
   * @returns the impact subscore
   */
  private computeImpactSubscore(): number {
    const confImpact = this.computeConfImpact();
    const integImpact = this.computeAvailImpact();
    const availImpact = this.computeIntegImpact();

    const impactScore =
      10.41 * (1 - (1 - confImpact) * (1 - integImpact) * (1 - availImpact));
    this.impactSubScore = impactScore;

    return impactScore;
  }

  /**
   * Compute the CVSS 2 Exploitability Subscore
   * @returns the exploitability subscore
   */
  private computeExploitabilitySubscore(): number {
    const accessVector = this.computeAccessVector();
    const accessComplexity = this.computeAccessComplexity();
    const authentication = this.computeAuthentication();

    const exploitabilityScore =
      20 * accessVector * accessComplexity * authentication;
    this.exploitabilitySubScore = exploitabilityScore;

    return exploitabilityScore;
  }

  /**
   * Transform discrete access vector to a continous score
   * @returns the continous score
   */
  private computeAccessVector(): number {
    switch (this.cvss2Info.AccessVector) {
      case AccessVector.LOCAL:
        return 0.395;
      case AccessVector.ADJACENT_NETWORK:
        return 0.646;
      case AccessVector.NETWORK:
        return 1.0;
      default:
        return 0.0;
    }
  }

  /**
   * Transform discrete access complexity to a continous score
   * @returns the continous score
   */
  private computeAccessComplexity(): number {
    switch (this.cvss2Info.AccessComplexity) {
      case AccessComplexity.HIGH:
        return 0.35;
      case AccessComplexity.MEDIUM:
        return 0.61;
      case AccessComplexity.LOW:
        return 0.71;
      default:
        return 0.0;
    }
  }

  /**
   * Transform discrete authentication field to a continous score
   * @returns the continous score
   */
  private computeAuthentication(): number {
    switch (this.cvss2Info.Authentication) {
      case Authentication.MULTIPLE:
        return 0.45;
      case Authentication.SINGLE:
        return 0.56;
      case Authentication.NONE:
        return 0.704;
      default:
        return 0.0;
    }
  }

  /**
   * Transform confidentiality impact field to a continous score
   * @returns the continous score
   */
  private computeConfImpact(): number {
    switch (this.cvss2Info.ConfidentialityImpact) {
      case Impact.NONE:
        return 0.0;
      case Impact.PARTIAL:
        return 0.275;
      case Impact.COMPLETE:
        return 0.66;
      default:
        return 0.0;
    }
  }

  /**
   * Transform availability impact field to a continous score
   * @returns the continous score
   */
  private computeAvailImpact(): number {
    switch (this.cvss2Info.AvailabilityImpact) {
      case Impact.NONE:
        return 0.0;
      case Impact.PARTIAL:
        return 0.275;
      case Impact.COMPLETE:
        return 0.66;
      default:
        return 0.0;
    }
  }

  /**
   * Transform integrity impact field to a continous score
   * @returns the continous score
   */
  private computeIntegImpact(): number {
    switch (this.cvss2Info.IntegrityImpact) {
      case Impact.NONE:
        return 0.0;
      case Impact.PARTIAL:
        return 0.275;
      case Impact.COMPLETE:
        return 0.66;
      default:
        return 0.0;
    }
  }

  /******************************************************************************/
  /**                        Temporal Score calculation                         */
  /******************************************************************************/

  private computeExploitability(): number {
    switch (this.cvss2Info.Exploitability) {
      case Exploitability.UNPROVEN:
        return 0.85;
      case Exploitability.PROOF_OF_CONCEPT:
        return 0.9;
      case Exploitability.FUNCTIONAL:
        return 0.95;
      case Exploitability.HIGH:
        return 1.0;
      default:
        return 1.0;
    }
  }

  private computeRemediationLevel(): number {
    switch (this.cvss2Info.RemediationLevel) {
      case RemediationLevel.OFFICIAL_FIX:
        return 0.87;
      case RemediationLevel.TEMPORARY_FIX:
        return 0.9;
      case RemediationLevel.WORKAROUND:
        return 0.95;
      case RemediationLevel.UNAVAILABLE:
        return 1.0;
      default:
        return 1.0;
    }
  }

  private computeReportConfidence(): number {
    switch (this.cvss2Info.ReportConfidence) {
      case ReportConfidence.UNCONFIRMED:
        return 0.9;
      case ReportConfidence.UNCORROBORATED:
        return 0.95;
      case ReportConfidence.CONFIRMED:
        return 1.0;
      default:
        return 1.0;
    }
  }

  /******************************************************************************/
  /**                      Environmental Score calculation                      */
  /******************************************************************************/

  private computeAdjustedTemportalScore(): number {
    const baseScore = this.computeAdjustedBaseSubScore();
    const exploitability = this.computeExploitability();
    const remediationLevel = this.computeRemediationLevel();
    const reportConfidence = this.computeReportConfidence();

    return baseScore * exploitability * remediationLevel * reportConfidence;
  }

  private computeAdjustedBaseSubScore(): number {
    const impact = this.computeAdjustedImpactScore();
    const exploitability = this.computeExploitabilitySubscore();
    const fImpact = impact === 0 ? 0 : 1.176;

    let baseScore = (0.6 * impact + 0.4 * exploitability - 1.5) * fImpact;
    baseScore = Math.round(baseScore * 10) / 10; // round to one decimal place
    this.baseScore = baseScore;

    return baseScore;
  }

  private computeAdjustedImpactScore(): number {
    const confidentialityImpact = this.computeConfImpact();
    const integrityImpact = this.computeIntegImpact();
    const availabilityImpact = this.computeAvailImpact();
    const confidenialityRequirement = this.computeConfidentialityRequirement();
    const integrityRequirement = this.computeIntegrityRequirement();
    const availabilityRequirement = this.computeAvailabilityRequirement();

    const adjustedImpactScore = Math.min(
      10,
      10.41 *
        (1 -
          (1 - confidentialityImpact * confidenialityRequirement) *
            (1 - integrityImpact * integrityRequirement) *
            (1 - availabilityImpact * availabilityRequirement)),
    );

    return adjustedImpactScore;
  }

  private computeCollateralDamangePotential(): number {
    switch (this.cvss2Info.CollateralDamagePotential) {
      case CollateralDamagePotential.NONE:
        return 0;
      case CollateralDamagePotential.LOW:
        return 0.1;
      case CollateralDamagePotential.LOW_MEDIUM:
        return 0.3;
      case CollateralDamagePotential.MEDIUM_HIGH:
        return 0.4;
      case CollateralDamagePotential.HIGH:
        return 0.5;
      default:
        return 0;
    }
  }

  private computeTargetDistribution(): number {
    switch (this.cvss2Info.TargetDistribution) {
      case TargetDistribution.NONE:
        return 0;
      case TargetDistribution.LOW:
        return 0.25;
      case TargetDistribution.MEDIUM:
        return 0.75;
      case TargetDistribution.HIGH:
        return 1.0;
      default:
        return 1.0;
    }
  }

  private computeConfidentialityRequirement(): number {
    switch (this.cvss2Info.ConfidentialityRequirement) {
      case SecurityRequirements.LOW:
        return 0.5;
      case SecurityRequirements.MEDIUM:
        return 1.0;
      case SecurityRequirements.HIGH:
        return 1.51;
      default:
        return 1.0;
    }
  }

  private computeAvailabilityRequirement(): number {
    switch (this.cvss2Info.AvailabilityRequirement) {
      case SecurityRequirements.LOW:
        return 0.5;
      case SecurityRequirements.MEDIUM:
        return 1.0;
      case SecurityRequirements.HIGH:
        return 1.51;
      default:
        return 1.0;
    }
  }

  private computeIntegrityRequirement(): number {
    switch (this.cvss2Info.IntegrityRequirement) {
      case SecurityRequirements.LOW:
        return 0.5;
      case SecurityRequirements.MEDIUM:
        return 1.0;
      case SecurityRequirements.HIGH:
        return 1.51;
      default:
        return 1.0;
    }
  }
}
