// Why a vulnerability instance is hidden by default (see ADR 0013). Pure, so
// experiments can import it; vuln-finder keeps a Go copy for notifications.
import {
  type SourceVerdict,
  SourceVerdictValue,
} from "src/codeclarity_modules/results/source-comparison/source-match.types";

import { differentOrigins } from "./source-origin";

export enum HiddenReason {
  /** Every source match is contradicted by a source of another origin. */
  Contradicted = "contradicted",
  /** Every source holding a record for the instance retired it. */
  RetiredAll = "retired_all",
}

export interface InstanceStatus {
  hidden: HiddenReason | null;
  /** Sources that withdrew or contradicted a source match, sorted. */
  contradicted_by: string[];
}

// Verdicts that deny a match made by a source of another origin.
const CONTRADICTING = new Set<SourceVerdictValue>([
  SourceVerdictValue.VersionExcluded,
  SourceVerdictValue.Retired,
  SourceVerdictValue.NamesAnotherProduct,
]);

// Verdicts saying the source holds a live record for the instance.
const LIVE_RECORD = new Set<SourceVerdictValue>([
  SourceVerdictValue.Matched,
  SourceVerdictValue.VersionExcluded,
  SourceVerdictValue.NamesAnotherProduct,
]);

// Derives the hidden reason from an instance's stored source verdicts; none hides nothing.
export function instanceStatus(
  verdicts: readonly SourceVerdict[] | undefined | null,
): InstanceStatus {
  const list = (verdicts ?? []).map((v) => ({
    source: v.source.toLowerCase(),
    verdict: v.verdict,
  }));
  const matched = list.filter((v) => v.verdict === SourceVerdictValue.Matched);

  const contradictedBy = new Set<string>();
  let contradictedMatches = 0;
  for (const match of matched) {
    const against = list.filter(
      (v) =>
        CONTRADICTING.has(v.verdict) &&
        differentOrigins(match.source, v.source),
    );
    if (against.length > 0) contradictedMatches++;
    for (const v of against) contradictedBy.add(v.source);
  }
  const contradicted_by = [...contradictedBy].sort();

  if (matched.length > 0 && contradictedMatches === matched.length) {
    return { hidden: HiddenReason.Contradicted, contradicted_by };
  }
  const retired = list.some((v) => v.verdict === SourceVerdictValue.Retired);
  if (retired && !list.some((v) => LIVE_RECORD.has(v.verdict))) {
    return { hidden: HiddenReason.RetiredAll, contradicted_by };
  }
  return { hidden: null, contradicted_by };
}
