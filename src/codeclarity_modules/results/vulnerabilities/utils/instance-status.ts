// Why a vulnerability instance is hidden by default (see ADR 0013). Pure, so
// experiments can import it; vuln-finder keeps a Go copy for notifications.
import {
  type SourceVerdict,
  SourceVerdictValue,
} from "src/codeclarity_modules/results/source-comparison/source-match.types";

import { differentOrigins } from "./origin-by-source";
import { contradicts, VERDICT_TRAITS } from "./verdict-traits";

export enum HiddenReason {
  /** Every source match is contradicted by a source of another origin. */
  Contradicted = "contradicted",
  /** Every source holding a record for the instance retired it. */
  RetiredAll = "retired_all",
}

export const HIDDEN_REASONS: readonly HiddenReason[] =
  Object.values(HiddenReason);

/** Hidden vulnerability instances by reason. */
export type HiddenCounts = Record<HiddenReason, number>;

export function emptyHiddenCounts(): HiddenCounts {
  return Object.fromEntries(
    HIDDEN_REASONS.map((reason) => [reason, 0]),
  ) as HiddenCounts;
}

export interface InstanceStatus {
  hidden: HiddenReason | null;
  /** Sources that withdrew or contradicted a source match, sorted. */
  contradicted_by: string[];
}

// Derives the hidden reason from an instance's stored source verdicts and OSV ecosystem; none hides nothing.
export function instanceStatus(
  verdicts: readonly SourceVerdict[] | undefined | null,
  ecosystem: string | undefined,
): InstanceStatus {
  const list = (verdicts ?? []).map((v) => ({
    ...v,
    source: v.source.toLowerCase(),
  }));
  const matched = list.filter((v) => v.verdict === SourceVerdictValue.Matched);

  const contradictedBy = new Set<string>();
  let contradictedMatches = 0;
  for (const match of matched) {
    const against = list.filter(
      (v) =>
        contradicts(v, ecosystem) && differentOrigins(match.source, v.source),
    );
    if (against.length > 0) contradictedMatches++;
    for (const v of against) contradictedBy.add(v.source);
  }
  const contradicted_by = [...contradictedBy].sort();

  if (matched.length > 0 && contradictedMatches === matched.length) {
    return { hidden: HiddenReason.Contradicted, contradicted_by };
  }
  const retired = list.some((v) => v.verdict === SourceVerdictValue.Retired);
  if (retired && !list.some((v) => VERDICT_TRAITS[v.verdict]?.liveRecord)) {
    return { hidden: HiddenReason.RetiredAll, contradicted_by };
  }
  return { hidden: null, contradicted_by };
}

/** The fields of a vulnerability instance the derivation reads. */
export interface JudgedInstance {
  SourceVerdicts?: readonly SourceVerdict[] | null;
  Ecosystem?: string;
}

/** The instances default views, counts and the grade use: hidden ones are left out. */
export function shownByDefault<T extends JudgedInstance>(
  instances: readonly T[],
): T[] {
  return instances.filter(
    (v) => instanceStatus(v.SourceVerdicts, v.Ecosystem).hidden === null,
  );
}
