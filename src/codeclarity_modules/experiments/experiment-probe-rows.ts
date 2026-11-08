/** Raw SQL readers for probe search rows, shared by the results service and the store. */
import type { ExposuresInput } from "./experiment-exposures";
import type {
  KnownVersionsInput,
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
const PROBE_OUTCOME_SELECT = `SELECT probe."datasetEntryId" AS dataset_entry_id,
         probe.commit_hash AS commit_hash,
         COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements(probe.packages) AS p
                    WHERE p->>'name' IN (SELECT instance.affected_dependency
                                           FROM experiment_vulnerability_instance AS instance
                                          WHERE instance."experimentId" = $1)),
                  '[]'::jsonb) AS packages
    FROM experiment_probe_outcome AS probe
   WHERE probe."experimentId" = $1`;

/** The instance columns results, exposures and probe planning read */
export const INSTANCE_COLUMNS = [
  "workspace",
  "affected_dependency",
  "affected_version",
  "direct_dependency",
  "vulnerability_id",
  "severity_class",
  "published_date",
  "epss_score",
  "conflict_flag",
  "winning_source",
  "withdrawn_date",
  "vulnerable_versions",
] as const;

/** Probe outcome rows of the experiment, or of some of its entries only. */
export function readProbeOutcomes(
  query: RawQuery,
  experimentId: string,
  entryIds: string[] | null,
): Promise<ResultsProbeInput[]> {
  return entryIds
    ? query<ResultsProbeInput>(`${PROBE_OUTCOME_SELECT} AND probe."datasetEntryId" = ANY($2)`, [experimentId, entryIds])
    : query<ResultsProbeInput>(PROBE_OUTCOME_SELECT, [experimentId]);
}

/** The distinct vulnerable versions the instances of every entry name. */
export function readKnownVersions(query: RawQuery, experimentId: string): Promise<KnownVersionsInput[]> {
  return query<KnownVersionsInput>(
    `SELECT DISTINCT vulnerability_id, affected_dependency, affected_version, vulnerable_versions
       FROM experiment_vulnerability_instance
      WHERE "experimentId" = $1`,
    [experimentId],
  );
}

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
  const [runs, vulnerabilities, probes, probeRows, known_versions] = await Promise.all([
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
      `SELECT instance."runId" AS run_id, ${INSTANCE_COLUMNS.map((c) => `instance.${c}`).join(", ")}
         FROM experiment_vulnerability_instance AS instance
         JOIN experiment_run AS run ON run.id = instance."runId"
        WHERE instance."experimentId" = $1 AND run."datasetEntryId" = ANY($2)`,
      [experimentId, entryIds],
    ),
    readProbeOutcomes(query, experimentId, entryIds),
    readProbeRows(query, experimentId, entryIds),
    readKnownVersions(query, experimentId),
  ]);
  return { runs, vulnerabilities, probes, ...probeRows, known_versions };
}

/** Snapshot attempts plus submitted fix probes: what the analysis budget counts. */
export async function readAnalysesSubmitted(query: RawQuery, experimentId: string): Promise<number> {
  const [row] = await query<{ submitted: string | number }>(
    `SELECT (SELECT COALESCE(SUM(attempts), 0) FROM experiment_run WHERE "experimentId" = $1)
          + (SELECT COUNT(*) FROM experiment_probe
              WHERE "experimentId" = $1 AND submitted_on IS NOT NULL) AS submitted`,
    [experimentId],
  );
  return Number(row?.submitted ?? 0);
}
