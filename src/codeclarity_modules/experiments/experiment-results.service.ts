import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Readable } from "node:stream";
import { In, QueryFailedError, Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { CodeClarityLogger } from "src/services/logger.service";
import { EntityNotFound } from "src/types/error.types";

import { Experiment, ExperimentStatus } from "./experiment.entity";
import type { AnalysisBudgetUsage } from "./experiment-budget";
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
import type { FigureRows } from "./experiment-figure-data";
import type { ResultIntervals } from "./experiment-intervals";
import { METRIC_VERSION } from "./experiment-metric-version";
import { ExperimentProbeOutcome } from "./experiment-probe-outcome.entity";
import {
  INSTANCE_COLUMNS,
  type RawQuery,
  readAnalysesSubmitted,
  readKnownVersions,
  readProbeOutcomes,
  readProbeRows,
} from "./experiment-probe-rows";
import type {
  KnownVersionsInput,
  ResultsProbeAnalysisInput,
  ResultsProbeIntervalInput,
} from "./experiment-probes";
import { ExperimentPublishedResults } from "./experiment-published-results.entity";
import {
  aggregateExperimentResults,
  computeResultIntervals,
  type ExperimentResults,
  type ExperimentResultsInput,
  headCutoff,
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
import {
  ExperimentAlreadyPublished,
  ExperimentNotPublishable,
} from "./experiments.errors";
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

/** Ended experiments whose bootstrap intervals are kept in memory */
const INTERVAL_CACHE_SIZE = 100;

/** The rows exposures are derived from. */
interface ExposureRows {
  runs: ResultsRunInput[];
  vulnerabilities: ResultsVulnerabilityInput[];
  probes: ResultsProbeInput[];
  probe_intervals: ResultsProbeIntervalInput[];
  probe_analyses: ResultsProbeAnalysisInput[];
  budget: AnalysisBudgetUsage | null;
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

/** One Published results version, without its payload. */
export interface PublishedResultsSummary {
  metric_version: number;
  published_on: Date;
  published_by_name: string | null;
}

/**
 * Reads over an experiment's copied rows: the results computed on every
 * read, and the streamed CSV exports.
 */
@Injectable()
export class ExperimentResultsService {
  private readonly logger = CodeClarityLogger.forService("Experiments");

  /** Bootstrap intervals by experiment and end time, oldest read first */
  private readonly intervalCache = new Map<string, ResultIntervals>();

  private readonly rawQuery: RawQuery = (sql, params) =>
    this.probeOutcomeRepository.query(sql, params);

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
    @InjectRepository(ExperimentPublishedResults, "codeclarity")
    private readonly publishedRepository: Repository<ExperimentPublishedResults>,
  ) {}

  /**
   * The newest Published results of an experiment, else its results computed
   * from its copied rows on every read (ADR 0001), over the runs done so far.
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
    const experiment = await findExperimentInOrg(
      this.experimentRepository,
      orgId,
      experimentId,
    );

    const published = await this.publishedRepository.findOne({
      where: { experiment: { id: experiment.id } },
      order: { metric_version: "DESC" },
    });
    return {
      experiment_name: experiment.name,
      results: published?.results ?? (await this.computeResults(experiment)),
    };
  }

  /**
   * Freeze a finished experiment's results under the current metric version.
   * One-way (ADR 0007). Runs the bootstrap unless it is already cached.
   * @throws {NotAuthorized} If the user is not an admin of the org
   * @throws {EntityNotFound} If the org has no such experiment
   * @throws {ExperimentNotPublishable} If the experiment is not COMPLETED
   * @throws {ExperimentAlreadyPublished} If this metric version is already stored
   */
  async publish(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<Omit<PublishedResultsSummary, "published_by_name">> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );
    const experiment = await findExperimentInOrg(
      this.experimentRepository,
      orgId,
      experimentId,
    );
    // Without an end time the bootstrap intervals would be left out
    if (
      experiment.status !== ExperimentStatus.COMPLETED ||
      !experiment.ended_on
    ) {
      throw new ExperimentNotPublishable();
    }
    // Checked first so a repeat request never runs the bootstrap
    const taken = await this.publishedRepository.exists({
      where: {
        experiment: { id: experiment.id },
        metric_version: METRIC_VERSION,
      },
    });
    if (taken) throw new ExperimentAlreadyPublished();

    const results = await this.computeResults(experiment);
    const stored = await this.publishedRepository
      .save({
        experiment,
        metric_version: METRIC_VERSION,
        results,
        published_on: new Date(),
        published_by: { id: user.userId },
      })
      .catch((error: unknown) => {
        throw isUniqueViolation(error)
          ? new ExperimentAlreadyPublished(error)
          : error;
      });
    this.logger.log("Experiment published", {
      experimentId: experiment.id,
      organizationId: orgId,
      userId: user.userId,
      metricVersion: METRIC_VERSION,
    });
    return {
      metric_version: stored.metric_version,
      published_on: stored.published_on,
    };
  }

  /**
   * The Published results versions of an experiment, newest first.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async listPublished(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<PublishedResultsSummary[]> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await findExperimentInOrg(
      this.experimentRepository,
      orgId,
      experimentId,
    );
    const versions = await this.publishedRepository.find({
      where: { experiment: { id: experiment.id } },
      select: {
        id: true,
        metric_version: true,
        published_on: true,
        published_by: { id: true, first_name: true, last_name: true },
      },
      relations: { published_by: true },
      order: { metric_version: "DESC" },
    });
    return versions.map(publishedSummary);
  }

  /**
   * One stored Published results version.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the experiment or the version does not exist
   */
  async getPublished(
    orgId: string,
    experimentId: string,
    metricVersion: number,
    user: AuthenticatedUser,
  ): Promise<ExperimentResults> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await findExperimentInOrg(
      this.experimentRepository,
      orgId,
      experimentId,
    );
    const published = await this.publishedRepository.findOne({
      where: {
        experiment: { id: experiment.id },
        metric_version: metricVersion,
      },
    });
    if (!published) throw new EntityNotFound();
    return published.results;
  }

  /** The results computed from the experiment's copied rows (ADR 0001). */
  private async computeResults(
    experiment: Experiment,
  ): Promise<ExperimentResults> {
    const [rows, summaries] = await Promise.all([
      this.exposureRows(experiment, null),
      this.summaryRows(experiment),
    ]);
    const input = {
      ...rows,
      summaries,
      provenance: provenanceInput(experiment),
    };
    return aggregateExperimentResults({
      ...input,
      bootstrap_intervals: this.intervalsOf(experiment, input),
    });
  }

  /** The tidy rows a Figure is computed from. */
  async figureRows(experiment: Experiment): Promise<FigureRows> {
    const [rows, summaries] = await Promise.all([
      this.exposureRows(experiment, null),
      this.summaryRows(experiment),
    ]);
    return {
      ...rows,
      summaries,
      head_cutoff: headCutoff(experiment.ended_on ?? null, new Date()),
    };
  }

  /** The copied summary of each done run, with its entry's star rank. */
  private summaryRows(experiment: Experiment): Promise<ResultsSummaryInput[]> {
    return this.summaryRepository
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
      .getRawMany<ResultsSummaryInput>();
  }

  /**
   * The bootstrap intervals of an ended experiment, computed once. Null
   * while it runs, as its rows still change on every poll.
   */
  private intervalsOf(
    experiment: Experiment,
    input: ExperimentResultsInput,
  ): ResultIntervals | null {
    if (!experiment.ended_on) return null;
    const key = `${experiment.id}:${new Date(experiment.ended_on).toISOString()}`;
    const intervals =
      this.intervalCache.get(key) ?? computeResultIntervals(input);
    // Re-inserting keeps the map ordered by last read
    this.intervalCache.delete(key);
    this.intervalCache.set(key, intervals);
    if (this.intervalCache.size > INTERVAL_CACHE_SIZE) {
      this.intervalCache.delete(this.intervalCache.keys().next().value!);
    }
    return intervals;
  }

  /**
   * Runs, instances and probe outcome rows of the experiment, or of some of
   * its dataset entries only.
   */
  private async exposureRows(
    experiment: Experiment,
    entryIds: string[] | null,
  ): Promise<ExposureRows> {
    const experimentId = experiment.id;
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
    instances.where('instance."experimentId" = :experimentId', {
      experimentId,
    });
    if (entryIds) {
      instances.andWhere('instance."runId" IN (:...runIds)', {
        runIds: runs.length ? runs.map((run) => run.id) : [null],
      });
    }

    const query = this.rawQuery;
    const budget = experiment.analysis_budget ?? null;
    const [vulnerabilities, probes, probeRows, submitted] = await Promise.all([
      instances.getRawMany<ResultsVulnerabilityInput>(),
      readProbeOutcomes(query, experimentId, entryIds),
      readProbeRows(query, experimentId, entryIds),
      budget === null ? null : readAnalysesSubmitted(query, experimentId),
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
        ...(run.dataset_entry
          ? { dataset_entry_id: run.dataset_entry.id }
          : {}),
      })),
      vulnerabilities,
      probes,
      ...probeRows,
      budget:
        budget === null || submitted === null
          ? null
          : { analysis_budget: budget, analyses_submitted: submitted },
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
    return this.exportExposureCsv(
      orgId,
      experimentId,
      user,
      "exposures.csv",
      EXPOSURE_CSV_COLUMNS,
      (entry, exposure) => exposureCsvRow(entry, exposure),
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
    return this.exportExposureCsv(
      orgId,
      experimentId,
      user,
      "fixes.csv",
      FIX_CSV_COLUMNS,
      fixCsvRow,
    );
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
    const experiment = await findExperimentInOrg(
      this.experimentRepository,
      orgId,
      experimentId,
    );
    // Read once over every entry, so each chunk dates fixes as the results page does
    let knownVersions: Promise<KnownVersionsInput[]> | null = null;

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
        const exposures = deriveExposures({
          ...(await this.exposureRows(experiment, [...byId.keys()])),
          known_versions: await (knownVersions ??= readKnownVersions(
            this.rawQuery,
            experiment.id,
          )),
        });
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
    const experiment = await findExperimentInOrg(
      this.experimentRepository,
      orgId,
      experimentId,
    );

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
        .select([
          ...exportSelect(RUN_CSV_COLUMNS, "summary"),
          GRID_INDEX_SELECT,
        ])
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
    const experiment = await findExperimentInOrg(
      this.experimentRepository,
      orgId,
      experimentId,
    );

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

function publishedSummary(
  published: ExperimentPublishedResults,
): PublishedResultsSummary {
  const publisher = published.published_by;
  return {
    metric_version: published.metric_version,
    published_on: published.published_on,
    published_by_name: publisher
      ? `${publisher.first_name} ${publisher.last_name}`
      : null,
  };
}

/** Postgres reports a broken unique constraint as SQLSTATE 23505. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { code?: string }).code === "23505"
  );
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
