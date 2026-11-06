import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Readable } from "node:stream";
import { Repository } from "typeorm";

import { AnalyzersRepository } from "src/base_modules/analyzers/analyzers.repository";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { CodeClarityLogger } from "src/services/logger.service";
import { TypedPaginatedResponse } from "src/types/apiResponses.types";
import { AlreadyExists, EntityNotFound } from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";

import { Dataset, DatasetStatus } from "../datasets/dataset.entity";
import { DatasetEntry } from "../datasets/dataset-entry.entity";
import { paginated, resolvePagination } from "../datasets/datasets.service";

import { Experiment, ExperimentStatus } from "./experiment.entity";
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
import { ExperimentRunnerService } from "./experiment-runner.service";
import { ExperimentVulnerabilityInstance } from "./experiment-vulnerability-instance.entity";
import {
  AnalyzerMissingRequiredPlugins,
  DatasetNotReady,
  ExperimentNotCancellable,
} from "./experiments.errors";
import {
  CreateExperimentBody,
  EXPERIMENT_DEFAULT_RETRIES,
  EXPERIMENT_REQUIRED_PLUGINS,
  ExperimentRunCounts,
  ExperimentRunSummary,
  ExperimentSummary,
} from "./experiments.types";

const EXPERIMENT_PAGINATION: PaginationConfig = {
  maxEntriesPerPage: 100,
  defaultEntriesPerPage: 20,
};

const RUN_PAGINATION: PaginationConfig = {
  maxEntriesPerPage: 500,
  defaultEntriesPerPage: 100,
};

/** Runs read per runs.csv chunk */
const RUN_EXPORT_CHUNK = 1000;

/**
 * Runs whose instances are read per vulnerabilities.csv chunk. A chunk
 * never splits a run, so its size is bounded by the runs' instance counts.
 */
const VULNERABILITY_EXPORT_RUNS_PER_CHUNK = 20;

const ENTRY_COLUMNS = ["rank", "full_name", "stars", "git_url"] as const;
const RUN_COLUMNS = [
  "status",
  "error",
  "attempts",
  "branch",
  "commit_hash",
  "committed_at",
] as const;
const SUMMARY_COLUMNS = RUN_CSV_COLUMNS.slice(
  ENTRY_COLUMNS.length + RUN_COLUMNS.length + 1, // + analysis_id
);
const INSTANCE_COLUMNS = VULNERABILITY_CSV_COLUMNS.slice(ENTRY_COLUMNS.length);

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

const SUMMARY_RELATIONS = {
  created_by: true,
  dataset: true,
  analyzer: true,
} as const;

@Injectable()
export class ExperimentsService {
  private readonly logger = CodeClarityLogger.forService("Experiments");

  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly analyzersRepository: AnalyzersRepository,
    @InjectRepository(Experiment, "codeclarity")
    private readonly experimentRepository: Repository<Experiment>,
    @InjectRepository(ExperimentRun, "codeclarity")
    private readonly runRepository: Repository<ExperimentRun>,
    @InjectRepository(Dataset, "codeclarity")
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(DatasetEntry, "codeclarity")
    private readonly entryRepository: Repository<DatasetEntry>,
    private readonly runner: ExperimentRunnerService,
    @InjectRepository(ExperimentRunSummaryRow, "codeclarity")
    private readonly summaryRepository: Repository<ExperimentRunSummaryRow>,
    @InjectRepository(ExperimentVulnerabilityInstance, "codeclarity")
    private readonly vulnerabilityRepository: Repository<ExperimentVulnerabilityInstance>,
  ) {}

  /**
   * Register an experiment with one pending run per dataset entry. The
   * runner picks it up and submits the analyses.
   * @throws {NotAuthorized} If the user is not an admin of the org or the analyzer belongs to another org
   * @throws {EntityNotFound} If the org has no such dataset
   * @throws {DatasetNotReady} If the dataset is not READY
   * @throws {AnalyzerMissingRequiredPlugins} If the analyzer lacks js-sbom or vuln-finder
   * @throws {AlreadyExists} If the org already has an experiment with this name
   */
  async create(
    orgId: string,
    body: CreateExperimentBody,
    user: AuthenticatedUser,
  ): Promise<string> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );

    const dataset = await this.datasetRepository.findOne({
      where: { id: body.dataset_id, organization: { id: orgId } },
    });
    if (!dataset) throw new EntityNotFound();
    if (dataset.status !== DatasetStatus.READY) throw new DatasetNotReady();

    await this.analyzersRepository.doesAnalyzerBelongToOrg(
      body.analyzer_id,
      orgId,
    );
    const analyzer = await this.analyzersRepository.getAnalyzerById(
      body.analyzer_id,
    );
    const plugins = new Set(analyzer.steps.flat().map((step) => step.name));
    if (!EXPERIMENT_REQUIRED_PLUGINS.every((name) => plugins.has(name))) {
      throw new AnalyzerMissingRequiredPlugins();
    }

    const name = body.name.trim();
    if (
      await this.experimentRepository.exists({
        where: { organization: { id: orgId }, name },
      })
    ) {
      throw new AlreadyExists();
    }

    const entries = await this.entryRepository.find({
      where: { dataset: { id: dataset.id } },
      select: { id: true },
      order: { rank: "ASC" },
    });

    const experiment = this.experimentRepository.create({
      name,
      status: ExperimentStatus.PENDING,
      retries: body.retries ?? EXPERIMENT_DEFAULT_RETRIES,
      created_on: new Date(),
      organization: { id: orgId },
      created_by: { id: user.userId },
      dataset: { id: body.dataset_id },
      analyzer: { id: body.analyzer_id },
      runs: entries.map((entry) => ({
        status: ExperimentRunStatus.PENDING,
        attempts: 0,
        dataset_entry: { id: entry.id },
      })),
    });
    const saved = await this.experimentRepository.save(experiment);
    this.logger.log("Experiment created", {
      experimentId: saved.id,
      organizationId: orgId,
      userId: user.userId,
      datasetId: dataset.id,
      analyzerId: analyzer.id,
      runs: entries.length,
    });
    this.runner.kick();
    return saved.id;
  }

  /**
   * @throws {NotAuthorized} If the user is not a member of the org
   */
  async getMany(
    orgId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
  ): Promise<TypedPaginatedResponse<ExperimentSummary>> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const { currentPage, entriesPerPage } = resolvePagination(
      paginationUserSuppliedConf,
      EXPERIMENT_PAGINATION,
    );

    const [experiments, fullCount] =
      await this.experimentRepository.findAndCount({
        where: { organization: { id: orgId } },
        relations: SUMMARY_RELATIONS,
        order: { created_on: "DESC" },
        skip: currentPage * entriesPerPage,
        take: entriesPerPage,
      });
    const counts = await this.countRuns(experiments.map((e) => e.id));

    return paginated(
      experiments.map((experiment) =>
        this.toSummary(experiment, counts.get(experiment.id)),
      ),
      fullCount,
      currentPage,
      entriesPerPage,
    );
  }

  /**
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async get(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentSummary> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await this.findInOrg(orgId, experimentId);
    const counts = await this.countRuns([experiment.id]);
    return this.toSummary(experiment, counts.get(experiment.id));
  }

  /**
   * The runs of an experiment in dataset entry rank order.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async getRuns(
    orgId: string,
    experimentId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
  ): Promise<TypedPaginatedResponse<ExperimentRunSummary>> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const experiment = await this.findInOrg(orgId, experimentId);
    const { currentPage, entriesPerPage } = resolvePagination(
      paginationUserSuppliedConf,
      RUN_PAGINATION,
    );

    const [runs, fullCount] = await this.runRepository.findAndCount({
      where: { experiment: { id: experiment.id } },
      relations: { dataset_entry: true, analysis: { project: true } },
      order: { dataset_entry: { rank: "ASC" } },
      skip: currentPage * entriesPerPage,
      take: entriesPerPage,
    });

    return paginated(
      runs.map((run) => ({
        id: run.id,
        status: run.status,
        error: run.error ?? null,
        attempts: run.attempts,
        branch: run.branch ?? null,
        commit_hash: run.commit_hash ?? null,
        committed_at: run.committed_at ?? null,
        submitted_on: run.submitted_on ?? null,
        ended_on: run.ended_on ?? null,
        analysis_id: run.analysis?.id ?? null,
        project_id: run.analysis?.project?.id ?? null,
        entry: {
          id: run.dataset_entry.id,
          rank: run.dataset_entry.rank,
          full_name: run.dataset_entry.full_name,
          git_url: run.dataset_entry.git_url,
          stars: run.dataset_entry.stars,
        },
      })),
      fullCount,
      currentPage,
      entriesPerPage,
    );
  }

  /**
   * Stop submitting analyses: unsubmitted runs are skipped, in-flight ones
   * finish and are still kept; the experiment ends CANCELLED.
   * @throws {NotAuthorized} If the user is not an admin of the org
   * @throws {EntityNotFound} If the org has no such experiment
   * @throws {ExperimentNotCancellable} If the experiment already ended
   */
  async cancel(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );
    const experiment = await this.findInOrg(orgId, experimentId);
    if (!(await this.runner.cancel(experiment.id))) {
      throw new ExperimentNotCancellable();
    }
    this.logger.log("Experiment cancel requested", {
      experimentId: experiment.id,
      organizationId: orgId,
      userId: user.userId,
    });
  }

  /**
   * Delete an experiment, its runs and the rows copied from them. Projects,
   * analyses and clones it produced are left alone.
   * @throws {NotAuthorized} If the user is not an admin of the org
   * @throws {EntityNotFound} If the org has no such experiment
   */
  async delete(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );
    const experiment = await this.findInOrg(orgId, experimentId);
    await this.experimentRepository.delete({ id: experiment.id });
    this.logger.log("Experiment deleted", {
      experimentId: experiment.id,
      organizationId: orgId,
      userId: user.userId,
    });
  }

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
    const experiment = await this.findInOrg(orgId, experimentId);

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
    const experiment = await this.findInOrg(orgId, experimentId);

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
        .select(ENTRY_COLUMNS.map((column) => `entry.${column} AS "${column}"`))
        .addSelect(RUN_COLUMNS.map((column) => `run.${column} AS "${column}"`))
        .addSelect('run."analysisId"', "analysis_id")
        .addSelect(
          SUMMARY_COLUMNS.map((column) => `summary.${column} AS "${column}"`),
        )
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
    const experiment = await this.findInOrg(orgId, experimentId);

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
          .select(
            ENTRY_COLUMNS.map((column) => `entry.${column} AS "${column}"`),
          )
          .addSelect(
            INSTANCE_COLUMNS.map(
              (column) => `instance.${column} AS "${column}"`,
            ),
          )
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

  private async findInOrg(
    orgId: string,
    experimentId: string,
  ): Promise<Experiment> {
    const experiment = await this.experimentRepository.findOne({
      where: { id: experimentId, organization: { id: orgId } },
      relations: SUMMARY_RELATIONS,
    });
    if (!experiment) throw new EntityNotFound();
    return experiment;
  }

  private async countRuns(
    experimentIds: string[],
  ): Promise<Map<string, ExperimentRunCounts>> {
    const counts = new Map<string, ExperimentRunCounts>();
    if (experimentIds.length === 0) return counts;
    const rows = await this.runRepository
      .createQueryBuilder("run")
      .select('run."experimentId"', "experiment_id")
      .addSelect("run.status", "status")
      .addSelect("COUNT(*)", "count")
      .where('run."experimentId" IN (:...experimentIds)', { experimentIds })
      .groupBy('run."experimentId"')
      .addGroupBy("run.status")
      .getRawMany<{
        experiment_id: string;
        status: ExperimentRunStatus;
        count: string;
      }>();
    for (const row of rows) {
      const entry = counts.get(row.experiment_id) ?? emptyRunCounts();
      entry[row.status] = Number(row.count);
      counts.set(row.experiment_id, entry);
    }
    return counts;
  }

  private toSummary(
    experiment: Experiment,
    runCounts: ExperimentRunCounts = emptyRunCounts(),
  ): ExperimentSummary {
    return {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      retries: experiment.retries,
      error: experiment.error ?? null,
      dataset_id: experiment.dataset?.id ?? null,
      dataset_name: experiment.dataset?.name ?? null,
      analyzer_id: experiment.analyzer?.id ?? null,
      analyzer_name: experiment.analyzer?.name ?? null,
      analyzer_steps: experiment.analyzer_steps ?? null,
      created_by_name: creatorName(experiment),
      created_on: experiment.created_on,
      started_on: experiment.started_on ?? null,
      ended_on: experiment.ended_on ?? null,
      run_count: Object.values(runCounts).reduce((a, b) => a + b, 0),
      run_counts: runCounts,
    };
  }
}

function creatorName(experiment: Experiment): string | null {
  const creator = experiment.created_by;
  return creator ? `${creator.first_name} ${creator.last_name}` : null;
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

function emptyRunCounts(): ExperimentRunCounts {
  return {
    [ExperimentRunStatus.PENDING]: 0,
    [ExperimentRunStatus.DONE]: 0,
    [ExperimentRunStatus.FAILED]: 0,
    [ExperimentRunStatus.SKIPPED]: 0,
  };
}
