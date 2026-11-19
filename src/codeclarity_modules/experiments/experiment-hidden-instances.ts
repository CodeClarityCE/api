/**
 * Instances hidden by default (ADR 0013): every source match contradicted by
 * another source origin, or retired on every source. Experiment metrics leave
 * them out unless a Figure asks to include them. Pure.
 */
import { HiddenReason } from "../results/vulnerabilities/utils/instance-status";

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
export function isHiddenInstance(v: Judged): boolean {
  return (
    v.instance_status === HiddenReason.Contradicted ||
    v.instance_status === HiddenReason.RetiredAll
  );
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
  const counts: HiddenInstanceCounts = { contradicted: 0, retired_all: 0 };
  for (const v of vulnerabilities) {
    if (isHiddenInstance(v)) counts[v.instance_status as `${HiddenReason}`]++;
  }
  return counts;
}

/** One caption phrase per reason that hid something. */
export function hiddenInstancePhrases(counts: HiddenInstanceCounts): string[] {
  return (Object.keys(REASON_TEXT) as `${HiddenReason}`[])
    .filter((reason) => counts[reason] > 0)
    .map(
      (reason) =>
        `${counts[reason]} ${counts[reason] === 1 ? "instance" : "instances"} hidden as ${REASON_TEXT[reason]}`,
    );
}

/**
 * Rows without hidden instances, with each run summary's instance total
 * lowered by the instances it hid, so summary metrics agree.
 */
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
