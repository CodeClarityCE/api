import { AnalysisStatus } from "./analysis.entity";

/** Where an analysis stands: done well, done badly, or still going. */
export type AnalysisOutcome = "succeeded" | "failed" | "running";

/** Go workers write "failure" where the API's enum says "failed". */
const GO_FAILURE = "failure";

export const SUCCEEDED_ANALYSIS_STATUSES: readonly string[] = [
  AnalysisStatus.SUCCESS,
  AnalysisStatus.COMPLETED,
];

const FAILED_ANALYSIS_STATUSES: readonly string[] = [
  GO_FAILURE,
  AnalysisStatus.FAILED,
  AnalysisStatus.CANCELLED,
];

/** No longer advancing through stages, so neither cancellable nor in flight. */
export const TERMINAL_ANALYSIS_STATUSES: readonly string[] = [
  ...SUCCEEDED_ANALYSIS_STATUSES,
  ...FAILED_ANALYSIS_STATUSES,
];

/**
 * Any other status counts as running, including "updating_db" (paused while
 * the knowledge DB refreshes, then resumed) and values this API does not know.
 */
export function analysisOutcome(status: string): AnalysisOutcome {
  if (SUCCEEDED_ANALYSIS_STATUSES.includes(status)) return "succeeded";
  if (FAILED_ANALYSIS_STATUSES.includes(status)) return "failed";
  return "running";
}
