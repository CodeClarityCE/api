// Instances hidden by default (ADR 0013), which experiment metrics leave out
// unless a Figure includes them. Pure.
import {
  emptyHiddenCounts,
  HIDDEN_REASONS,
  HiddenReason,
} from "../results/vulnerabilities/utils/instance-status";

import type { InstanceStatusValue } from "./experiment-row-copy";

/** Hidden instances by reason. */
export type HiddenInstanceCounts = Record<`${HiddenReason}`, number>;

/** What a caption says for each reason. */
const REASON_TEXT: Record<`${HiddenReason}`, string> = {
  [HiddenReason.Contradicted]: "contradicted by another source",
  [HiddenReason.RetiredAll]: "retired on every source",
};

interface Judged {
  instance_status?: InstanceStatusValue | null;
}

/** Rows copied without source verdicts (null status) count as visible. */
function isHiddenInstance(v: Judged): boolean {
  return HIDDEN_REASONS.includes(v.instance_status as HiddenReason);
}

/** The instances metrics count by default. */
export function visibleInstances<T extends Judged>(
  vulnerabilities: readonly T[],
): T[] {
  return vulnerabilities.filter((v) => !isHiddenInstance(v));
}

export function hiddenInstanceCounts(
  vulnerabilities: readonly Judged[],
): HiddenInstanceCounts {
  const counts = emptyHiddenCounts();
  for (const v of vulnerabilities) {
    if (isHiddenInstance(v)) counts[v.instance_status as `${HiddenReason}`]++;
  }
  return counts;
}

/** One caption phrase per reason that hid something. */
export function hiddenInstancePhrases(counts: HiddenInstanceCounts): string[] {
  return HIDDEN_REASONS.filter((reason) => counts[reason] > 0).map(
    (reason) =>
      `${counts[reason]} ${counts[reason] === 1 ? "instance" : "instances"} hidden as ${REASON_TEXT[reason]}`,
  );
}

/** Rows without hidden instances; each run's instance total drops by what it hid. */
export function withoutHiddenInstances<
  T extends {
    vulnerabilities: readonly (Judged & { run_id: string })[];
    summaries?: readonly { run_id: string; total_vulnerabilities: number }[];
  },
>(rows: T): T {
  const hiddenByRun = new Map<string, number>();
  for (const v of rows.vulnerabilities) {
    if (isHiddenInstance(v)) {
      hiddenByRun.set(v.run_id, (hiddenByRun.get(v.run_id) ?? 0) + 1);
    }
  }
  if (hiddenByRun.size === 0) return rows;
  return {
    ...rows,
    vulnerabilities: visibleInstances(rows.vulnerabilities),
    ...(rows.summaries
      ? {
          summaries: rows.summaries.map((s) => ({
            ...s,
            total_vulnerabilities:
              s.total_vulnerabilities - (hiddenByRun.get(s.run_id) ?? 0),
          })),
        }
      : {}),
  };
}
