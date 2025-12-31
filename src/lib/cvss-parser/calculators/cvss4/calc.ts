/**
 * @author Herzog Cédric
 * Spec: https://www.first.org/cvss/v4.0/specification-document
 *
 * CVSS 4.0 uses a fundamentally different scoring algorithm than v2/v3.
 * Instead of formula-based calculations, it uses:
 * 1. MacroVector classification (6-digit string representing EQ1-EQ5+EQ6)
 * 2. Lookup table for base scores
 * 3. Interpolation for fine-grained scoring within equivalence classes
 */

import type { CVSS4Info } from "../../types/fields/cvss4";
import { roundUp } from "../../utils/utils";

import {
  cvssLookup,
  maxComposed,
  maxSeverity,
  severityDistance,
} from "./lookup";

// Mapping constants for converting enum values to short forms
const METRIC_MAPS = {
  av: {
    NETWORK: "N",
    ADJACENT_NETWORK: "A",
    LOCAL: "L",
    PHYSICAL: "P",
    NOT_DEFINED: "X",
  },
  ac: { LOW: "L", HIGH: "H", NOT_DEFINED: "X" },
  at: { NONE: "N", PRESENT: "P", NOT_DEFINED: "X" },
  pr: { NONE: "N", LOW: "L", HIGH: "H", NOT_DEFINED: "X" },
  ui: { NONE: "N", PASSIVE: "P", ACTIVE: "A", NOT_DEFINED: "X" },
  impact: { NONE: "N", LOW: "L", HIGH: "H", NOT_DEFINED: "X", NEGLIGIBLE: "N" },
  e: {
    ATTACKED: "A",
    PROOF_OF_CONCEPT: "P",
    UNREPORTED: "U",
    NOT_DEFINED: "X",
  },
  sr: { HIGH: "H", MEDIUM: "M", LOW: "L", NOT_DEFINED: "X" },
  msi: { SAFETY: "S", HIGH: "H", LOW: "L", NEGLIGIBLE: "N", NOT_DEFINED: "X" },
} as const;

type MetricMapKey = keyof typeof METRIC_MAPS;

/**
 * Convert an enum value to its short form using the appropriate map
 */
function mapMetric(value: string, mapKey: MetricMapKey): string {
  const map = METRIC_MAPS[mapKey] as Record<string, string>;
  return map[value] ?? "X";
}

/**
 * Get effective value: use modified if defined, otherwise use base
 */
function getEffective(
  modified: string,
  base: string,
  defaultValue?: string,
): string {
  if (modified !== "X") return modified;
  if (base !== "X") return base;
  return defaultValue ?? base;
}

export class CVSS4Calculator {
  score = 0;
  cvss4Info: CVSS4Info | null = null;

  // Effective metric values (accounting for Modified metrics)
  private effectiveMetrics: Record<string, string> = {};

  /******************************************************************************/
  /**                             Public Methods                                */
  /******************************************************************************/

  /**
   * Compute the CVSS 4.0 score from the parsed CVSS 4.0 Vector
   * @param cvss4Info the parsed CVSS 4.0 Vector
   * @returns the CVSS 4.0 score (0.0 - 10.0)
   */
  public computeScore(cvss4Info: CVSS4Info): number {
    this.cvss4Info = cvss4Info;
    this.computeEffectiveMetrics();

    // Check for zero impact - if all impact metrics are NONE/NEGLIGIBLE, score is 0
    if (this.hasNoImpact()) {
      this.score = 0.0;
      return 0.0;
    }

    // Step 1: Compute MacroVector
    const macroVector = this.computeMacroVector();

    // Step 2: Look up the base score from the MacroVector table
    const lookupScore = cvssLookup[macroVector];
    if (lookupScore === undefined) {
      // MacroVector not found in lookup table
      this.score = 0.0;
      return 0.0;
    }

    // Step 3: Compute severity distances and interpolate
    const eq1 = parseInt(macroVector.charAt(0));
    const eq2 = parseInt(macroVector.charAt(1));
    const eq3 = parseInt(macroVector.charAt(2));
    const eq4 = parseInt(macroVector.charAt(3));
    const eq5 = parseInt(macroVector.charAt(4));
    const eq6 = parseInt(macroVector.charAt(5));

    // Get the maximum severity distances for each EQ
    const eq1MaxSeverity = maxSeverity.eq1[eq1] ?? 0;
    const eq2MaxSeverity = maxSeverity.eq2[eq2] ?? 0;
    const eq3eq6MaxSeverity = maxSeverity.eq3eq6[eq3]?.[eq6] ?? 0;
    const eq4MaxSeverity = maxSeverity.eq4[eq4] ?? 0;
    const eq5MaxSeverity = maxSeverity.eq5[eq5] ?? 0;

    // Calculate available distances (difference to next lower MacroVector score)
    const eq1NextLower = this.getNextLowerMacroVector(macroVector, 0);
    const eq2NextLower = this.getNextLowerMacroVector(macroVector, 1);
    const eq3eq6NextLower = this.getNextLowerMacroVector36(macroVector);
    const eq4NextLower = this.getNextLowerMacroVector(macroVector, 3);
    const eq5NextLower = this.getNextLowerMacroVector(macroVector, 4);

    const eq1Available =
      eq1NextLower !== null ? lookupScore - (cvssLookup[eq1NextLower] ?? 0) : 0;
    const eq2Available =
      eq2NextLower !== null ? lookupScore - (cvssLookup[eq2NextLower] ?? 0) : 0;
    const eq3eq6Available =
      eq3eq6NextLower !== null
        ? lookupScore - (cvssLookup[eq3eq6NextLower] ?? 0)
        : 0;
    const eq4Available =
      eq4NextLower !== null ? lookupScore - (cvssLookup[eq4NextLower] ?? 0) : 0;
    const eq5Available =
      eq5NextLower !== null ? lookupScore - (cvssLookup[eq5NextLower] ?? 0) : 0;

    // Calculate severity distances from the highest severity vector
    const eq1SeverityDistance = this.computeEQ1SeverityDistance(eq1);
    const eq2SeverityDistance = this.computeEQ2SeverityDistance(eq2);
    const eq3eq6SeverityDistance = this.computeEQ3EQ6SeverityDistance(eq3, eq6);
    const eq4SeverityDistance = this.computeEQ4SeverityDistance(eq4);
    const eq5SeverityDistance = this.computeEQ5SeverityDistance(eq5);

    // Compute proportions
    const eq1Proportion =
      eq1MaxSeverity > 0 ? eq1SeverityDistance / eq1MaxSeverity : 0;
    const eq2Proportion =
      eq2MaxSeverity > 0 ? eq2SeverityDistance / eq2MaxSeverity : 0;
    const eq3eq6Proportion =
      eq3eq6MaxSeverity > 0 ? eq3eq6SeverityDistance / eq3eq6MaxSeverity : 0;
    const eq4Proportion =
      eq4MaxSeverity > 0 ? eq4SeverityDistance / eq4MaxSeverity : 0;
    const eq5Proportion =
      eq5MaxSeverity > 0 ? eq5SeverityDistance / eq5MaxSeverity : 0;

    // Compute mean of proportional adjustments
    let adjustments = 0;
    let count = 0;

    if (eq1Available > 0) {
      adjustments += eq1Available * eq1Proportion;
      count++;
    }
    if (eq2Available > 0) {
      adjustments += eq2Available * eq2Proportion;
      count++;
    }
    if (eq3eq6Available > 0) {
      adjustments += eq3eq6Available * eq3eq6Proportion;
      count++;
    }
    if (eq4Available > 0) {
      adjustments += eq4Available * eq4Proportion;
      count++;
    }
    if (eq5Available > 0) {
      adjustments += eq5Available * eq5Proportion;
      count++;
    }

    const meanAdjustment = count > 0 ? adjustments / count : 0;

    // Final score
    this.score = Math.max(0.0, Math.min(10.0, lookupScore - meanAdjustment));
    return this.score;
  }

  /**
   * Returns the computed score
   * @param roundUpVal Whether to round up to nearest 0.1
   * @returns the CVSS 4.0 score
   */
  public getScore(roundUpVal: boolean): number {
    if (roundUpVal) return roundUp(this.score);
    return this.score;
  }

  /**
   * Returns the severity rating based on the score
   * @returns 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
   */
  public getSeverity(): string {
    const score = roundUp(this.score);
    if (score === 0.0) return "NONE";
    if (score < 4.0) return "LOW";
    if (score < 7.0) return "MEDIUM";
    if (score < 9.0) return "HIGH";
    return "CRITICAL";
  }

  /******************************************************************************/
  /**                          MacroVector Computation                          */
  /******************************************************************************/

  /**
   * Compute the 6-digit MacroVector string
   * Each digit represents an equivalence class level (0, 1, or 2)
   */
  private computeMacroVector(): string {
    const eq1 = this.computeEQ1();
    const eq2 = this.computeEQ2();
    const eq3 = this.computeEQ3();
    const eq4 = this.computeEQ4();
    const eq5 = this.computeEQ5();
    const eq6 = this.computeEQ6();

    return `${eq1}${eq2}${eq3}${eq4}${eq5}${eq6}`;
  }

  /**
   * EQ1: Exploitability (AV, PR, UI)
   */
  private computeEQ1(): number {
    const av = this.effectiveMetrics["AV"];
    const pr = this.effectiveMetrics["PR"];
    const ui = this.effectiveMetrics["UI"];

    // Level 0: AV:N and PR:N and UI:N
    if (av === "N" && pr === "N" && ui === "N") {
      return 0;
    }

    // Level 1: (AV:N or PR:N or UI:N) and not (AV:N and PR:N and UI:N) and not AV:P
    if ((av === "N" || pr === "N" || ui === "N") && av !== "P") {
      return 1;
    }

    // Level 2: AV:P or not (AV:N or PR:N or UI:N)
    return 2;
  }

  /**
   * EQ2: Attack Complexity (AC, AT)
   */
  private computeEQ2(): number {
    const ac = this.effectiveMetrics["AC"];
    const at = this.effectiveMetrics["AT"];

    // Level 0: AC:L and AT:N
    if (ac === "L" && at === "N") {
      return 0;
    }

    // Level 1: not (AC:L and AT:N)
    return 1;
  }

  /**
   * EQ3: Vulnerable System Impact (VC, VI, VA)
   */
  private computeEQ3(): number {
    const vc = this.effectiveMetrics["VC"];
    const vi = this.effectiveMetrics["VI"];
    const va = this.effectiveMetrics["VA"];

    // Level 0: VC:H and VI:H
    if (vc === "H" && vi === "H") {
      return 0;
    }

    // Level 1: not (VC:H and VI:H) and (VC:H or VI:H or VA:H)
    if (vc === "H" || vi === "H" || va === "H") {
      return 1;
    }

    // Level 2: not (VC:H or VI:H or VA:H)
    return 2;
  }

  /**
   * EQ4: Subsequent System Impact (SC, SI, SA) - modified versions may include Safety
   */
  private computeEQ4(): number {
    const msi = this.effectiveMetrics["MSI"];
    const msa = this.effectiveMetrics["MSA"];
    const sc = this.effectiveMetrics["SC"];
    const si = this.effectiveMetrics["SI"];
    const sa = this.effectiveMetrics["SA"];

    // Check for Safety values in modified metrics
    if (msi === "S" || msa === "S") {
      return 0;
    }

    // Use effective values (modified if set, else base)
    const effectiveSC = sc;
    const effectiveSI = msi !== "X" ? msi : si;
    const effectiveSA = msa !== "X" ? msa : sa;

    // Level 0: MSI:S or MSA:S
    // (already handled above)

    // Level 1: SC:H or SI:H or SA:H
    if (effectiveSC === "H" || effectiveSI === "H" || effectiveSA === "H") {
      return 1;
    }

    // Level 2: not (SC:H or SI:H or SA:H)
    return 2;
  }

  /**
   * EQ5: Exploit Maturity (E)
   */
  private computeEQ5(): number {
    const e = this.effectiveMetrics["E"];

    // Level 0: E:A (Attacked)
    if (e === "A") {
      return 0;
    }

    // Level 1: E:P (Proof of Concept)
    if (e === "P") {
      return 1;
    }

    // Level 2: E:U (Unreported) or E:X (Not Defined - defaults to A)
    return 2;
  }

  /**
   * EQ6: Environmental impact modifiers (CR, IR, AR combined with VC, VI, VA)
   */
  private computeEQ6(): number {
    const cr = this.effectiveMetrics["CR"];
    const ir = this.effectiveMetrics["IR"];
    const ar = this.effectiveMetrics["AR"];
    const vc = this.effectiveMetrics["VC"];
    const vi = this.effectiveMetrics["VI"];
    const va = this.effectiveMetrics["VA"];

    // Level 0: (CR:H and VC:H) or (IR:H and VI:H) or (AR:H and VA:H)
    if (
      (cr === "H" && vc === "H") ||
      (ir === "H" && vi === "H") ||
      (ar === "H" && va === "H")
    ) {
      return 0;
    }

    // Level 1: not level 0
    return 1;
  }

  /******************************************************************************/
  /**                        Severity Distance Computation                      */
  /******************************************************************************/

  /**
   * Compute severity distance for EQ1
   */
  private computeEQ1SeverityDistance(eq1Level: number): number {
    const maxVectors = maxComposed.eq1[eq1Level];
    if (!maxVectors || maxVectors.length === 0) return 0;

    let minDistance = Infinity;

    for (const maxVector of maxVectors) {
      let distance = 0;
      const parts = maxVector.split("/").filter((p) => p.length > 0);

      for (const part of parts) {
        const splitPart = part.split(":");
        const metric = splitPart[0];
        const value = splitPart[1];
        if (!metric || !value) continue;
        const currentValue = this.effectiveMetrics[metric];
        if (currentValue && severityDistance[metric]) {
          const maxSev = severityDistance[metric][value] ?? 0;
          const curSev = severityDistance[metric][currentValue] ?? 0;
          distance += Math.max(0, curSev - maxSev);
        }
      }

      minDistance = Math.min(minDistance, distance);
    }

    return minDistance === Infinity ? 0 : minDistance;
  }

  /**
   * Compute severity distance for EQ2
   */
  private computeEQ2SeverityDistance(eq2Level: number): number {
    const maxVectors = maxComposed.eq2[eq2Level];
    if (!maxVectors || maxVectors.length === 0) return 0;

    let minDistance = Infinity;

    for (const maxVector of maxVectors) {
      let distance = 0;
      const parts = maxVector.split("/").filter((p) => p.length > 0);

      for (const part of parts) {
        const splitPart = part.split(":");
        const metric = splitPart[0];
        const value = splitPart[1];
        if (!metric || !value) continue;
        const currentValue = this.effectiveMetrics[metric];
        if (currentValue && severityDistance[metric]) {
          const maxSev = severityDistance[metric][value] ?? 0;
          const curSev = severityDistance[metric][currentValue] ?? 0;
          distance += Math.max(0, curSev - maxSev);
        }
      }

      minDistance = Math.min(minDistance, distance);
    }

    return minDistance === Infinity ? 0 : minDistance;
  }

  /**
   * Compute severity distance for EQ3+EQ6 (combined)
   */
  private computeEQ3EQ6SeverityDistance(
    eq3Level: number,
    eq6Level: number,
  ): number {
    const eq3Data = maxComposed.eq3[eq3Level];
    if (!eq3Data) return 0;

    const maxVectors = eq3Data[eq6Level.toString()];
    if (!maxVectors || maxVectors.length === 0) return 0;

    let minDistance = Infinity;

    for (const maxVector of maxVectors) {
      let distance = 0;
      const parts = maxVector.split("/").filter((p) => p.length > 0);

      for (const part of parts) {
        const splitPart = part.split(":");
        const metric = splitPart[0];
        const value = splitPart[1];
        if (!metric || !value) continue;
        const currentValue = this.effectiveMetrics[metric];
        if (currentValue && severityDistance[metric]) {
          const maxSev = severityDistance[metric][value] ?? 0;
          const curSev = severityDistance[metric][currentValue] ?? 0;
          distance += Math.max(0, curSev - maxSev);
        }
      }

      minDistance = Math.min(minDistance, distance);
    }

    return minDistance === Infinity ? 0 : minDistance;
  }

  /**
   * Compute severity distance for EQ4
   */
  private computeEQ4SeverityDistance(eq4Level: number): number {
    const maxVectors = maxComposed.eq4[eq4Level];
    if (!maxVectors || maxVectors.length === 0) return 0;

    let minDistance = Infinity;

    for (const maxVector of maxVectors) {
      let distance = 0;
      const parts = maxVector.split("/").filter((p) => p.length > 0);

      for (const part of parts) {
        const splitPart = part.split(":");
        const metric = splitPart[0];
        const value = splitPart[1];
        if (!metric || !value) continue;
        const currentValue = this.effectiveMetrics[metric];
        if (currentValue && severityDistance[metric]) {
          const maxSev = severityDistance[metric][value] ?? 0;
          const curSev = severityDistance[metric][currentValue] ?? 0;
          distance += Math.max(0, curSev - maxSev);
        }
      }

      minDistance = Math.min(minDistance, distance);
    }

    return minDistance === Infinity ? 0 : minDistance;
  }

  /**
   * Compute severity distance for EQ5
   */
  private computeEQ5SeverityDistance(eq5Level: number): number {
    const maxVectors = maxComposed.eq5[eq5Level];
    if (!maxVectors || maxVectors.length === 0) return 0;

    // EQ5 only has one metric (E), so distance calculation is simpler
    const e = this.effectiveMetrics["E"] ?? "X";
    const eDistance: Record<string, number> = { A: 0, P: 1, U: 2 };

    // The max vector for the level gives the baseline
    const firstVector = maxVectors[0] ?? "";
    const maxE = firstVector.split(":")[1]?.replace("/", "") ?? "A";
    const maxLevel = eDistance[maxE] ?? 0;
    const curLevel = eDistance[e] ?? 0;

    return Math.max(0, curLevel - maxLevel);
  }

  /******************************************************************************/
  /**                              Helper Methods                               */
  /******************************************************************************/

  /**
   * Compute effective metric values (considering modified metrics)
   */
  private computeEffectiveMetrics(): void {
    if (!this.cvss4Info) return;

    const info = this.cvss4Info;

    // Map base metrics
    const base = {
      AV: mapMetric(info.AttackVector, "av"),
      AC: mapMetric(info.AttackComplexity, "ac"),
      AT: mapMetric(info.AttackRequirements, "at"),
      PR: mapMetric(info.PrivilegesRequired, "pr"),
      UI: mapMetric(info.UserInteraction, "ui"),
      VC: mapMetric(info.VulnerableConfidentialityImpact, "impact"),
      VI: mapMetric(info.VulnerableIntegrityImpact, "impact"),
      VA: mapMetric(info.VulnerableAvailabilityImpact, "impact"),
      SC: mapMetric(info.SubsequentConfidentialityImpact, "impact"),
      SI: mapMetric(info.SubsequentIntegrityImpact, "impact"),
      SA: mapMetric(info.SubsequentAvailabilityImpact, "impact"),
    };

    // Map modified metrics
    const mod = {
      AV: mapMetric(info.ModifiedAttackVector, "av"),
      AC: mapMetric(info.ModifiedAttackComplexity, "ac"),
      AT: mapMetric(info.ModifiedAttackRequirements, "at"),
      PR: mapMetric(info.ModifiedPrivilegesRequired, "pr"),
      UI: mapMetric(info.ModifiedUserInteraction, "ui"),
      VC: mapMetric(info.ModifiedVulnerableConfidentialityImpact, "impact"),
      VI: mapMetric(info.ModifiedVulnerableIntegrityImpact, "impact"),
      VA: mapMetric(info.ModifiedVulnerableAvailabilityImpact, "impact"),
      SC: mapMetric(info.ModifiedSubsequentConfidentialityImpact, "impact"),
      SI: mapMetric(info.ModifiedSubsequentIntegrityImpact, "msi"),
      SA: mapMetric(info.ModifiedSubsequentAvailabilityImpact, "msi"),
    };

    // Compute effective values (modified if set, otherwise base)
    this.effectiveMetrics = {
      AV: getEffective(mod.AV, base.AV),
      AC: getEffective(mod.AC, base.AC),
      AT: getEffective(mod.AT, base.AT),
      PR: getEffective(mod.PR, base.PR),
      UI: getEffective(mod.UI, base.UI),
      VC: getEffective(mod.VC, base.VC),
      VI: getEffective(mod.VI, base.VI),
      VA: getEffective(mod.VA, base.VA),
      SC: getEffective(mod.SC, base.SC),
      SI: getEffective(mod.SI, base.SI),
      SA: getEffective(mod.SA, base.SA),
      E: getEffective(mapMetric(info.ExploitMaturity, "e"), "X", "A"),
      CR: getEffective(
        mapMetric(info.ConfidentialityRequirement, "sr"),
        "X",
        "H",
      ),
      IR: getEffective(mapMetric(info.IntegrityRequirement, "sr"), "X", "H"),
      AR: getEffective(mapMetric(info.AvailabilityRequirement, "sr"), "X", "H"),
      MSI: mod.SI,
      MSA: mod.SA,
    };
  }

  /**
   * Check if there's no impact (all impact metrics are NONE/NEGLIGIBLE)
   */
  private hasNoImpact(): boolean {
    const vc = this.effectiveMetrics["VC"];
    const vi = this.effectiveMetrics["VI"];
    const va = this.effectiveMetrics["VA"];
    const sc = this.effectiveMetrics["SC"];
    const si = this.effectiveMetrics["SI"];
    const sa = this.effectiveMetrics["SA"];

    const noVulnerableImpact = vc === "N" && vi === "N" && va === "N";
    const noSubsequentImpact = sc === "N" && si === "N" && sa === "N";

    return noVulnerableImpact && noSubsequentImpact;
  }

  /**
   * Get the next lower MacroVector by incrementing a specific position
   */
  private getNextLowerMacroVector(
    macroVector: string,
    position: number,
  ): string | null {
    const chars = macroVector.split("");
    const currentChar = chars[position];
    if (currentChar === undefined) return null;
    const current = parseInt(currentChar);

    if (current >= 2) {
      return null; // Already at lowest level
    }

    chars[position] = (current + 1).toString();
    const newVector = chars.join("");

    // Check if this MacroVector exists in the lookup table
    return cvssLookup[newVector] !== undefined ? newVector : null;
  }

  /**
   * Get the next lower MacroVector for EQ3+EQ6 (positions 2 and 5)
   * This handles the special case where EQ3 and EQ6 are interdependent
   */
  private getNextLowerMacroVector36(macroVector: string): string | null {
    const chars = macroVector.split("");
    const char2 = chars[2];
    const char5 = chars[5];
    if (char2 === undefined || char5 === undefined) return null;
    const eq3 = parseInt(char2);
    const eq6 = parseInt(char5);

    // Try incrementing EQ3 first
    if (eq3 < 2) {
      chars[2] = (eq3 + 1).toString();
      const newVector = chars.join("");
      if (cvssLookup[newVector] !== undefined) {
        return newVector;
      }
      chars[2] = eq3.toString(); // Reset
    }

    // Try incrementing EQ6
    if (eq6 < 1) {
      chars[5] = (eq6 + 1).toString();
      const newVector = chars.join("");
      if (cvssLookup[newVector] !== undefined) {
        return newVector;
      }
    }

    return null;
  }
}
