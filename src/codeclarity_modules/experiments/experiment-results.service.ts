import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Readable } from "node:stream";
import { In, Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { CodeClarityLogger } from "src/services/logger.service";

import { Experiment } from "./experiment.entity";
import {
  type CsvEntry,
  type CsvRow,
  EXPOSURE_CSV_COLUMNS,
  exposureCsvRow,
  FIX_CSV_COLUMNS,
  fixCsvRow,
  RUN_CSV_COLUMNS,
  streamCsv,
  VULNERABILITY_CSV_COLUMNS,
} from "./experiment-csv";
import { deriveExposures, type Exposure } from "./experiment-exposures";
import { ExperimentProbeOutcome } from "./experiment-probe-outcome.entity";
import {
  aggregateExperimentResults,
  type ExperimentResults,
  type KnowledgeSnapshot,
  type ResultsProbeInput,
  type ResultsProvenanceInput,
  type ResultsRunInput,
  type ResultsSummaryInput,
  type ResultsVulnerabilityInput,
} from "./experiment-results";
import { ExperimentRun, ExperimentRunStatus } from "./experiment-run.entity";
import { ExperimentRunSummaryRow } from "./experiment-run-summary-row.entity";
import { ExperimentVulnerabilityInstance } from "./experiment-vulnerability-instance.entity";
import { creatorName, findExperimentInOrg } from "./experiments.service";

/** Runs read per runs.csv chunk */
const RUN_EXPORT_CHUNK = 1000;

/**
 * Runs whose instances are read per vulnerabilities.csv chunk. A chunk
 * never splits a run, so its size is bounded by the runs' instance counts.
 */
const VULNERABILITY_EXPORT_RUNS_PER_CHUNK = 20;

/** Entries whose exposures are derived per exposures.csv / fixes.csv chunk */
const EXPOSURE_EXPORT_ENTRIES_PER_CHUNK = 20;

/** The instance columns results and exposures read */
const INSTANCE_COLUMNS = [
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
] as const;

/**
 * Probe outcome rows with only the packages some instance of the
 * experiment names: fix kinds need nothing else, and full rows are large.
 */
const PROBE_SELECT = `SELECT probe."datasetEntryId" AS dataset_entry_id,
         probe.commit_hash AS commit_hash,
         COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements(probe.packages) AS p
                    WHERE p->>'name' IN (SELECT instance.affected_dependency
                                           FROM experiment_vulnerability_instance AS instance
                                          WHERE instance."experimentId" = $1)),
                  '[]'::jsonb) AS packages
    FROM experiment_probe_outcome AS probe
   WHERE probe."experimentId" = $1`;

/** The rows exposures are derived from. */
interface ExposureRows {
  runs: ResultsRunInput[];
  vulnerabilities: ResultsVulnerabilityInput[];
  probes: ResultsProbeInput[];
}

/** Export columns read from the dataset entry and from the run itself */
const ENTRY_COLUMNS: ReadonlySet<string> = new Set([
  "rank",
  "full_name",
  "stars",
  "git_url",
]);
const RUN_COLUMNS: ReadonlySet<string> = new Set([
  "status",
  "error",
  "attempts",
  "branch",
  "commit_hash",
  "committed_at",
]);

/** The run's grid date as its UTC calendar day, "HEAD" for HEAD. */
const GRID_DATE_SELECT = `CASE WHEN run.grid_date IS NULL THEN 'HEAD'
  ELSE to_char(run.grid_date AT TIME ZONE 'UTC', 'YYYY-MM-DD') END AS "grid_date"`;

/** Export chunks are keyed by (rank, grid index): read along, not written */
const GRID_INDEX_SELECT = 'run.grid_index AS "grid_index"';

/** Rows strictly after the last exported (rank, grid index). */
function afterSnapshot(after: CsvRow): {
  where: string;
  params: { rank: number; gridIndex: number };
} {
  return {
    where: "(entry.rank, run.grid_index) > (:rank, :gridIndex)",
    params: {
      rank: Number(after["rank"]),
      gridIndex: Number(after["grid_index"]),
    },
  };
}

/**
 * SELECT expressions for export columns, each aliased to its CSV header:
 * entry and run columns from their tables, the rest from `rowsAlias` (the
 * copied summary or instance rows).
 */
function exportSelect(
  columns: readonly string[],
  rowsAlias: "summary" | "instance",
): string[] {
  return columns.map((column) => {
    if (column === "analysis_id") return 'run."analysisId" AS "analysis_id"';
    if (column === "grid_date") return GRID_DATE_SELECT;
    let alias: string = rowsAlias;
    if (ENTRY_COLUMNS.has(column)) alias = "entry";
    else if (RUN_COLUMNS.has(column)) alias = "run";
    return `${alias}.${column} AS "${column}"`;
  });
}

/** A streamed CSV export of an experiment. */
export interface ExperimentCsvExport {
  experiment_name: string;
  stream: Readable;
}

/** The results of an experiment, for download. */
export interface ExperimentResultsExport {
  experiment_name: string;
  results: ExperimentResults;
}

/**
 * Reads over an experiment's copied rows: the results computed on every
 * read, and the streamed CSV exports.
 */
@Injectable()
export class ExperimentResultsService {
  private readonly logger = CodeClarityLogger.forService("Experiments");

  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    @InjectRepository(Experiment, "codeclarity")
    private readonly experimentRepository: Repository<Experiment>,
    @InjectRepository(ExperimentRun, "codeclarity")
    private readonly runRepository: Repository<ExperimentRun>,
    @InjectRepository(ExperimentRunSummaryRow, "codeclarity")
    private readonly summaryRepository: Repository<ExperimentRunSummaryRow>,
    @InjectRepository(ExperimentVulnerabilityInstance, "codeclarity")
    private readonly vulnerabilityRepository: Repository<ExperimentVulnerabilityInstance>,
    @InjectRepository(ExperimentProbeOutcome, "codeclarity")
    private readonly probeOutcomeRepository: Repository<ExperimentProbeOutcome>,
  ) {}

  /**
   * The dataset-level results of an experiment, computed from its copied
   * rows on every read (ADR 0001). Results of a running or cancelled
   * experiment cover the runs done so far.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async getResults(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentResults> {
    return (await this.exportResults(orgId, experimentId, user)).results;
  }

  /**
   * The results payload with the experiment's name, for results.json.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async exportResults(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentResultsExport> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await findExperimentInOrg(this.experimentRepository, orgId, experimentId);

    const [rows, summaries] = await Promise.all([
      this.exposureRows(experiment.id, null),
      this.summaryRepository
        .createQueryBuilder("summary")
        .innerJoin("summary.run", "run")
        .innerJoin("run.dataset_entry", "entry")
        .select('summary."runId"', "run_id")
        .addSelect("entry.rank", "rank")
        .addSelect("summary.total_dependencies", "total_dependencies")
        .addSelect("summary.total_vulnerabilities", "total_vulnerabilities")
        .addSelect("summary.package_manager", "package_manager")
        .where('summary."experimentId" = :experimentId', {
          experimentId: experiment.id,
        })
        .getRawMany<ResultsSummaryInput>(),
    ]);

    return {
      experiment_name: experiment.name,
      results: aggregateExperimentResults({
        ...rows,
        summaries,
        provenance: provenanceInput(experiment),
      }),
    };
  }

  /**
   * Runs, instances and probe outcome rows of the experiment, or of some of
   * its dataset entries only.
   */
  private async exposureRows(
    experimentId: string,
    entryIds: string[] | null,
  ): Promise<ExposureRows> {
    const runs = await this.runRepository.find({
      where: {
        experiment: { id: experimentId },
        ...(entryIds ? { dataset_entry: { id: In(entryIds) } } : {}),
      },
      select: {
        id: true,
        status: true,
        error: true,
        grid_index: true,
        grid_date: true,
        knowledge: true,
        commit_hash: true,
        committed_at: true,
        shared_from: { id: true },
        dataset_entry: { id: true },
      },
      relations: { shared_from: true, dataset_entry: true },
    });

    const instances = this.vulnerabilityRepository
      .createQueryBuilder("instance")
      .select('instance."runId"', "run_id");
    for (const column of INSTANCE_COLUMNS) {
      instances.addSelect(`instance.${column}`, column);
    }
    instances.where('instance."experimentId" = :experimentId', { experimentId });
    if (entryIds) {
      instances.andWhere('instance."runId" IN (:...runIds)', {
        runIds: runs.length ? runs.map((run) => run.id) : [null],
      });
    }

    const [vulnerabilities, probes] = await Promise.all([
      instances.getRawMany<ResultsVulnerabilityInput>(),
      entryIds
        ? this.probeOutcomeRepository.query<ResultsProbeInput[]>(
            `${PROBE_SELECT} AND probe."datasetEntryId" = ANY($2)`,
            [experimentId, entryIds],
          )
        : this.probeOutcomeRepository.query<ResultsProbeInput[]>(PROBE_SELECT, [
            experimentId,
          ]),
    ]);

    return {
      runs: runs.map((run) => ({
        status: run.status,
        error: run.error ?? null,
        grid_index: run.grid_index,
        grid_date: run.grid_date ?? null,
        commit_hash: run.commit_hash ?? null,
        committed_at: run.committed_at ?? null,
        rows_run_id: run.shared_from?.id ?? run.id,
        knowledge: knowledgeSnapshot(run.knowledge),
        ...(run.dataset_entry ? { dataset_entry_id: run.dataset_entry.id } : {}),
      })),
      vulnerabilities,
      probes,
    };
  }

  /**
   * exposures.csv: one row per exposure, derived on read, by entry rank.
   * Streamed a few entries at a time.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async exportExposuresCsv(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentCsvExport> {
    return this.exportExposureCsv(orgId, experimentId, user, "exposures.csv", EXPOSURE_CSV_COLUMNS, (entry, exposure) =>
      exposureCsvRow(entry, exposure),
    );
  }

  /**
   * fixes.csv: one row per fix, derived on read, by entry rank. Streamed a
   * few entries at a time.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async exportFixesCsv(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentCsvExport> {
    return this.exportExposureCsv(orgId, experimentId, user, "fixes.csv", FIX_CSV_COLUMNS, fixCsvRow);
  }

  private async exportExposureCsv(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
    file: string,
    columns: readonly string[],
    toRow: (entry: CsvEntry, exposure: Exposure) => CsvRow | null,
  ): Promise<ExperimentCsvExport> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await findExperimentInOrg(this.experimentRepository, orgId, experimentId);

    const nextChunk = async (after: CsvRow | null): Promise<CsvRow[]> => {
      let afterRank = after ? Number(after["rank"]) : null;
      // Entries without rows give empty chunks: skip past them, since an
      // empty chunk ends the export.
      for (;;) {
        const query = this.runRepository
          .createQueryBuilder("run")
          .innerJoin("run.dataset_entry", "entry")
          .select("entry.id", "id")
          .addSelect("entry.rank", "rank")
          .addSelect("entry.full_name", "full_name")
          .where('run."experimentId" = :experimentId', {
            experimentId: experiment.id,
          });
        if (afterRank !== null) {
          query.andWhere("entry.rank > :afterRank", { afterRank });
        }
        const entries = await query
          .groupBy("entry.id")
          .addGroupBy("entry.rank")
          .addGroupBy("entry.full_name")
          .orderBy("entry.rank", "ASC")
          .limit(EXPOSURE_EXPORT_ENTRIES_PER_CHUNK)
          .getRawMany<CsvEntry & { id: string }>();
        if (entries.length === 0) return [];

        const byId = new Map(entries.map((entry) => [entry.id, entry]));
        const exposures = deriveExposures(
          await this.exposureRows(experiment.id, [...byId.keys()]),
        );
        const rows = exposures
          .map((exposure) => {
            const entry = byId.get(exposure.dataset_entry_id);
            return entry ? toRow(entry, exposure) : null;
          })
          .filter((row): row is CsvRow => row !== null)
          .sort((a, b) => Number(a["rank"]) - Number(b["rank"]));
        if (rows.length > 0) return rows;
        afterRank = Number(entries[entries.length - 1]!.rank);
      }
    };

    return {
      experiment_name: experiment.name,
      stream: this.logStreamErrors(
        streamCsv(columns, nextChunk),
        file,
        experiment.id,
      ),
    };
  }

  /**
   * runs.csv: one row per run by entry rank then grid date, with the
   * entry's metadata and, for done runs, the copied summary (of the run it
   * shares from, if any). Streamed in chunks keyed by (rank, grid index).
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async exportRunsCsv(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentCsvExport> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await findExperimentInOrg(this.experimentRepository, orgId, experimentId);

    const nextChunk = (after: CsvRow | null): Promise<CsvRow[]> => {
      const query = this.runRepository
        .createQueryBuilder("run")
        .innerJoin("run.dataset_entry", "entry")
        .leftJoin(
          ExperimentRunSummaryRow,
          "summary",
          'summary."runId" = COALESCE(run."sharedFromId", run.id) AND run.status = :done',
          { done: ExperimentRunStatus.DONE },
        )
        .select([...exportSelect(RUN_CSV_COLUMNS, "summary"), GRID_INDEX_SELECT])
        .where('run."experimentId" = :experimentId', {
          experimentId: experiment.id,
        });
      if (after) {
        const { where, params } = afterSnapshot(after);
        query.andWhere(where, params);
      }
      return query
        .orderBy("entry.rank", "ASC")
        .addOrderBy("run.grid_index", "ASC")
        .limit(RUN_EXPORT_CHUNK)
        .getRawMany<CsvRow>();
    };

    return {
      experiment_name: experiment.name,
      stream: this.logStreamErrors(
        streamCsv(RUN_CSV_COLUMNS, nextChunk),
        "runs.csv",
        experiment.id,
      ),
    };
  }

  /**
   * vulnerabilities.csv: one row per copied vulnerability instance, with the
   * entry's metadata, by entry rank then grid date. Streamed a few done
   * runs at a time; runs sharing another's rows hold none and are passed.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async exportVulnerabilitiesCsv(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentCsvExport> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await findExperimentInOrg(this.experimentRepository, orgId, experimentId);

    const nextChunk = async (after: CsvRow | null): Promise<CsvRow[]> => {
      let cursor = after;
      // Done runs without instances give empty reads: skip past them, since
      // an empty chunk ends the export.
      for (;;) {
        const query = this.runRepository
          .createQueryBuilder("run")
          .innerJoin("run.dataset_entry", "entry")
          .select("run.id", "id")
          .addSelect("entry.rank", "rank")
          .addSelect(GRID_INDEX_SELECT)
          .where('run."experimentId" = :experimentId', {
            experimentId: experiment.id,
          })
          .andWhere("run.status = :done", { done: ExperimentRunStatus.DONE })
          .andWhere('run."sharedFromId" IS NULL');
        if (cursor) {
          const { where, params } = afterSnapshot(cursor);
          query.andWhere(where, params);
        }
        const runs = await query
          .orderBy("entry.rank", "ASC")
          .addOrderBy("run.grid_index", "ASC")
          .limit(VULNERABILITY_EXPORT_RUNS_PER_CHUNK)
          .getRawMany<{ id: string; rank: number; grid_index: number }>();
        if (runs.length === 0) return [];

        const rows = await this.vulnerabilityRepository
          .createQueryBuilder("instance")
          .innerJoin("instance.run", "run")
          .innerJoin("run.dataset_entry", "entry")
          .select([
            ...exportSelect(VULNERABILITY_CSV_COLUMNS, "instance"),
            GRID_INDEX_SELECT,
          ])
          .where('instance."runId" IN (:...runIds)', {
            runIds: runs.map((run) => run.id),
          })
          .orderBy("entry.rank", "ASC")
          .addOrderBy("run.grid_index", "ASC")
          .addOrderBy("instance.id", "ASC")
          .getRawMany<CsvRow>();
        if (rows.length > 0) return rows;
        cursor = runs[runs.length - 1]!;
      }
    };

    return {
      experiment_name: experiment.name,
      stream: this.logStreamErrors(
        streamCsv(VULNERABILITY_CSV_COLUMNS, nextChunk),
        "vulnerabilities.csv",
        experiment.id,
      ),
    };
  }

  /** A stream failing mid-export cuts the download short: leave a trace. */
  private logStreamErrors(
    stream: Readable,
    file: string,
    experimentId: string,
  ): Readable {
    stream.on("error", (error: unknown) => {
      this.logger.error(
        `Experiment export ${file} failed`,
        error instanceof Error ? error : String(error),
        { experimentId },
      );
    });
    return stream;
  }
}

function knowledgeSnapshot(value: unknown): KnowledgeSnapshot | null {
  return typeof value === "object" &&
    value !== null &&
    "knowledge_sources" in value
    ? (value as KnowledgeSnapshot)
    : null;
}

/** The provenance the runner recorded on the experiment, as results show it. */
function provenanceInput(experiment: Experiment): ResultsProvenanceInput {
  const recorded = experiment.provenance ?? {};
  const apiVersion = recorded["api_version"];
  return {
    api_version: typeof apiVersion === "string" ? apiVersion : null,
    analyzer_steps: experiment.analyzer_steps ?? null,
    knowledge_start: knowledgeSnapshot(recorded["knowledge_start"]),
    knowledge_end: knowledgeSnapshot(recorded["knowledge_end"]),
    created_by: creatorName(experiment),
    created_on: experiment.created_on,
    started_on: experiment.started_on ?? null,
    ended_on: experiment.ended_on ?? null,
  };
}
