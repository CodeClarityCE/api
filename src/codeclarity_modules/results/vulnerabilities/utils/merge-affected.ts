// Groups a vulnerability's findings into one card with an entry per affected version.
import { isWorseSeverity } from "src/codeclarity_modules/results/utils/utils";

import type {
  AffectedVuln,
  Vulnerability,
  VulnerabilityMerged,
} from "../vulnerabilities.types";

import { isUncorroborated } from "./uncorroborated";

/** One finding as an affected entry, with its derived labels. */
export function affectedOf(finding: Vulnerability): AffectedVuln {
  return {
    Sources: finding.Sources,
    AffectedDependency: finding.AffectedDependency,
    AffectedVersion: finding.AffectedVersion,
    VulnerabilityId: finding.VulnerabilityId,
    OSVMatch: finding.OSVMatch,
    NVDMatch: finding.NVDMatch,
    Severity: finding.Severity,
    Conflict: finding.Conflict,
    ...(finding.GCVEMatch ? { GCVEMatch: finding.GCVEMatch } : {}),
    ...(finding.Weaknesses ? { Weaknesses: finding.Weaknesses } : {}),
    ...(finding.Disputed === true ? { Disputed: true } : {}),
    ...(finding.SourceVerdicts
      ? { SourceVerdicts: finding.SourceVerdicts }
      : {}),
    Uncorroborated: isUncorroborated(finding.SourceVerdicts),
    ...(finding.Hidden ? { Hidden: finding.Hidden } : {}),
    ...(finding.ContradictedBy
      ? { ContradictedBy: finding.ContradictedBy }
      : {}),
  };
}

/** Adds an entry to a card, which lists every matching source, its worst severity and any label. */
export function addAffected(
  vuln: VulnerabilityMerged,
  affected: AffectedVuln,
): void {
  vuln.Affected.push(affected);
  if (affected.Disputed) vuln.Disputed = true;
  if (affected.Uncorroborated) vuln.Uncorroborated = true;
  for (const source of affected.Sources) {
    if (!vuln.Sources.includes(source)) vuln.Sources.push(source);
  }
  if (isWorseSeverity(affected.Severity, vuln.Severity)) {
    vuln.Severity = affected.Severity;
  }
}
