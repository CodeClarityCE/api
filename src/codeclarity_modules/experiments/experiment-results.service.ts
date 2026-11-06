import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Readable } from "node:stream";
import { Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { CodeClarityLogger } from "src/services/logger.service";

import { Experiment } from "./experiment.entity";
import {
  type CsvRow,
  RUN_CSV_COLUMNS,
  streamCsv,
  VULNERABILITY_CSV_COLUMNS,
} from "./experiment-csv";
import {
  aggregateExperimentResults,
  type ExperimentResults,
  type KnowledgeSnapshot,
  type ResultsProvenanceInput,
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

    const [runs, summaries, vulnerabilities] = await Promise.all([
      this.runRepository.find({
        where: { experiment: { id: experiment.id } },
        select: { id: true, status: true, error: true },
      }),
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
      this.vulnerabilityRepository
        .createQueryBuilder("instance")
        .select('instance."runId"', "run_id")
        .addSelect("instance.affected_dependency", "affected_dependency")
        .addSelect("instance.vulnerability_id", "vulnerability_id")
        .addSelect("instance.severity_class", "severity_class")
        .addSelect("instance.epss_score", "epss_score")
        .addSelect("instance.conflict_flag", "conflict_flag")
        .addSelect("instance.winning_source", "winning_source")
        .addSelect("instance.withdrawn_date", "withdrawn_date")
        .where('instance."experimentId" = :experimentId', {
          experimentId: experiment.id,
        })
        .getRawMany<ResultsVulnerabilityInput>(),
    ]);

    return {
      experiment_name: experiment.name,
      results: aggregateExperimentResults({
        runs: runs.map((run) => ({
          status: run.status,
          error: run.error ?? null,
        })),
        summaries,
        vulnerabilities,
        provenance: provenanceInput(experiment),
      }),
    };
  }

  /**
   * runs.csv: one row per run by entry rank, with the entry's metadata and,
   * for done runs, the copied summary. Streamed in chunks keyed by rank.
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
          'summary."runId" = run.id AND run.status = :done',
          { done: ExperimentRunStatus.DONE },
        )
        .select(exportSelect(RUN_CSV_COLUMNS, "summary"))
        .where('run."experimentId" = :experimentId', {
          experimentId: experiment.id,
        });
      if (after) query.andWhere("entry.rank > :rank", { rank: after["rank"] });
      return query
        .orderBy("entry.rank", "ASC")
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
   * entry's metadata, by entry rank. Streamed a few done runs at a time.
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
      let afterRank = after ? Number(after["rank"]) : -1;
      // Done runs without instances give empty reads: skip past them, since
      // an empty chunk ends the export.
      for (;;) {
        const runs = await this.runRepository
          .createQueryBuilder("run")
          .innerJoin("run.dataset_entry", "entry")
          .select("run.id", "id")
          .addSelect("entry.rank", "rank")
          .where('run."experimentId" = :experimentId', {
            experimentId: experiment.id,
          })
          .andWhere("run.status = :done", { done: ExperimentRunStatus.DONE })
          .andWhere("entry.rank > :afterRank", { afterRank })
          .orderBy("entry.rank", "ASC")
          .limit(VULNERABILITY_EXPORT_RUNS_PER_CHUNK)
          .getRawMany<{ id: string; rank: number }>();
        if (runs.length === 0) return [];

        const rows = await this.vulnerabilityRepository
          .createQueryBuilder("instance")
          .innerJoin("instance.run", "run")
          .innerJoin("run.dataset_entry", "entry")
          .select(exportSelect(VULNERABILITY_CSV_COLUMNS, "instance"))
          .where('instance."runId" IN (:...runIds)', {
            runIds: runs.map((run) => run.id),
          })
          .orderBy("entry.rank", "ASC")
          .addOrderBy("instance.id", "ASC")
          .getRawMany<CsvRow>();
        if (rows.length > 0) return rows;
        afterRank = runs[runs.length - 1]!.rank;
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
