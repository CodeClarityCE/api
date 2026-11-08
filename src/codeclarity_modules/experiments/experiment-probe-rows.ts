/**
 * Raw SQL readers for the rows fix probes are searched over, shared by the
 * results service (dating on read) and the store (planning probes).
 */
import type { ExposuresInput } from "./experiment-exposures";
import type {
  ResultsProbeAnalysisInput,
  ResultsProbeIntervalInput,
} from "./experiment-probes";
import type {
  ResultsProbeInput,
  ResultsRunInput,
  ResultsVulnerabilityInput,
} from "./experiment-results";

/** A raw query, as Repository.query or EntityManager.query runs it. */
export type RawQuery = <T>(sql: string, params: unknown[]) => Promise<T[]>;

/**
 * The listed intervals and probe analyses of an experiment, or of some of
 * its dataset entries only.
 */
export async function readProbeRows(
  query: RawQuery,
  experimentId: string,
  entryIds: string[] | null,
): Promise<{
  probe_intervals: ResultsProbeIntervalInput[];
  probe_analyses: ResultsProbeAnalysisInput[];
}> {
  const params = entryIds ? [experimentId, entryIds] : [experimentId];
  const byEntry = entryIds ? ` AND "datasetEntryId" = ANY($2)` : "";
  const [probe_intervals, probe_analyses] = await Promise.all([
    query<ResultsProbeIntervalInput>(
      `SELECT "datasetEntryId" AS dataset_entry_id, NULLIF(from_commit, '') AS from_commit,
              to_commit, candidates, error
         FROM experiment_probe_interval
        WHERE "experimentId" = $1${byEntry}`,
      params,
    ),
    query<ResultsProbeAnalysisInput>(
      `SELECT "datasetEntryId" AS dataset_entry_id, commit_hash, status, error
         FROM experiment_probe
        WHERE "experimentId" = $1${byEntry}`,
      params,
    ),
  ]);
  return { probe_intervals, probe_analyses };
}

/**
 * Probe outcome rows with only the packages some instance of the
 * experiment names: dating and fix kinds need nothing else.
 */
export const PROBE_OUTCOME_SELECT = `SELECT probe."datasetEntryId" AS dataset_entry_id,
         probe.commit_hash AS commit_hash,
         COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements(probe.packages) AS p
                    WHERE p->>'name' IN (SELECT instance.affected_dependency
                                           FROM experiment_vulnerability_instance AS instance
                                          WHERE instance."experimentId" = $1)),
                  '[]'::jsonb) AS packages
    FROM experiment_probe_outcome AS probe
   WHERE probe."experimentId" = $1`;

/** Entries of the experiment whose snapshot runs have all ended */
const ENDED_ENTRIES = `SELECT DISTINCT run."datasetEntryId" FROM experiment_run AS run
   WHERE run."experimentId" = $1
     AND NOT EXISTS (SELECT 1 FROM experiment_run AS other
                      WHERE other."experimentId" = $1
                        AND other."datasetEntryId" = run."datasetEntryId"
                        AND other.status = 'pending')`;

/**
 * Everything probe planning reads, for the entries whose snapshots have all
 * ended: their runs (with analysis and branch), instances, probe outcome
 * rows, listed intervals and probe analyses.
 */
export async function readPlanningRows(
  query: RawQuery,
  experimentId: string,
): Promise<ExposuresInput & { runs: ResultsRunInput[] }> {
  const entryIds = (
    await query<{ datasetEntryId: string }>(ENDED_ENTRIES, [experimentId])
  ).map((row) => row.datasetEntryId);
  if (entryIds.length === 0) {
    return { runs: [], vulnerabilities: [], probes: [], probe_intervals: [], probe_analyses: [] };
  }
  const [runs, vulnerabilities, probes, probeRows] = await Promise.all([
    query<ResultsRunInput>(
      `SELECT run.status, run.error, run.grid_index, run.grid_date, run.commit_hash,
              run.committed_at, run.branch, run."analysisId" AS analysis_id,
              COALESCE(run."sharedFromId", run.id) AS rows_run_id,
              run."datasetEntryId" AS dataset_entry_id
         FROM experiment_run AS run
        WHERE run."experimentId" = $1 AND run."datasetEntryId" = ANY($2)`,
      [experimentId, entryIds],
    ),
    query<ResultsVulnerabilityInput>(
      `SELECT instance."runId" AS run_id, instance.workspace, instance.affected_dependency,
              instance.affected_version, instance.direct_dependency, instance.vulnerability_id,
              instance.severity_class, instance.published_date, instance.epss_score,
              instance.conflict_flag, instance.winning_source, instance.withdrawn_date,
              instance.vulnerable_versions
         FROM experiment_vulnerability_instance AS instance
         JOIN experiment_run AS run ON run.id = instance."runId"
        WHERE instance."experimentId" = $1 AND run."datasetEntryId" = ANY($2)`,
      [experimentId, entryIds],
    ),
    query<ResultsProbeInput>(
      `${PROBE_OUTCOME_SELECT} AND probe."datasetEntryId" = ANY($2)`,
      [experimentId, entryIds],
    ),
    readProbeRows(query, experimentId, entryIds),
  ]);
  return { runs, vulnerabilities, probes, ...probeRows };
}

/** Snapshot attempts plus fix probes: what the analysis budget counts. */
export async function readAnalysesSubmitted(query: RawQuery, experimentId: string): Promise<number> {
  const [row] = await query<{ submitted: string | number }>(
    `SELECT (SELECT COALESCE(SUM(attempts), 0) FROM experiment_run WHERE "experimentId" = $1)
          + (SELECT COUNT(*) FROM experiment_probe WHERE "experimentId" = $1) AS submitted`,
    [experimentId],
  );
  return Number(row?.submitted ?? 0);
}
