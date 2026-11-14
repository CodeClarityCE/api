import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AnalyzersRepository } from "src/base_modules/analyzers/analyzers.repository";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { CodeClarityLogger } from "src/services/logger.service";
import { TypedPaginatedResponse } from "src/types/apiResponses.types";
import {
  AlreadyExists,
  EntityInUse,
  EntityNotFound,
} from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";

import { Dataset, DatasetStatus } from "../datasets/dataset.entity";
import { DatasetEntry } from "../datasets/dataset-entry.entity";
import { paginated, resolvePagination } from "../datasets/datasets.service";

import { Experiment, ExperimentStatus } from "./experiment.entity";
import { estimateAnalyses } from "./experiment-budget";
import {
  DEFAULT_GRID_COUNT,
  DEFAULT_GRID_INTERVAL,
  gridDay,
  snapshotGrid,
} from "./experiment-grid";
import { ExperimentPublishedResults } from "./experiment-published-results.entity";
import { ExperimentRun, ExperimentRunStatus } from "./experiment-run.entity";
import { ExperimentRunnerService } from "./experiment-runner.service";
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
    @InjectRepository(ExperimentPublishedResults, "codeclarity")
    private readonly publishedRepository: Repository<ExperimentPublishedResults>,
  ) {}

  /**
   * Register an experiment with one pending run per snapshot: every grid
   * date of every dataset entry, plus HEAD. The runner picks it up and
   * submits the analyses.
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

    const createdOn = new Date();
    const gridInterval = body.grid_interval ?? DEFAULT_GRID_INTERVAL;
    const gridCount = body.grid_count ?? DEFAULT_GRID_COUNT;
    const grid = snapshotGrid(createdOn, gridInterval, gridCount);

    const experiment = this.experimentRepository.create({
      name,
      status: ExperimentStatus.PENDING,
      retries: body.retries ?? EXPERIMENT_DEFAULT_RETRIES,
      grid_interval: gridInterval,
      grid_count: gridCount,
      analysis_budget: body.analysis_budget ?? null,
      created_on: createdOn,
      organization: { id: orgId },
      created_by: { id: user.userId },
      dataset: { id: body.dataset_id },
      analyzer: { id: body.analyzer_id },
      runs: entries.flatMap((entry) =>
        grid.map((snapshot) => ({
          status: ExperimentRunStatus.PENDING,
          attempts: 0,
          ...snapshot,
          dataset_entry: { id: entry.id },
        })),
      ),
    });
    const saved = await this.experimentRepository.save(experiment);
    this.logger.log("Experiment created", {
      experimentId: saved.id,
      organizationId: orgId,
      userId: user.userId,
      datasetId: dataset.id,
      analyzerId: analyzer.id,
      gridInterval,
      gridCount,
      runs: entries.length * grid.length,
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
   * The runs of an experiment by dataset entry rank, then grid date (HEAD last).
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
      relations: {
        dataset_entry: true,
        analysis: { project: true },
        shared_from: true,
      },
      order: { dataset_entry: { rank: "ASC" }, grid_index: "ASC" },
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
        grid_index: run.grid_index,
        grid_date: run.grid_date ?? null,
        shared_from_run_id: run.shared_from?.id ?? null,
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
   * @throws {EntityInUse} If the experiment has Published results
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
    const published = await this.publishedRepository.exists({
      where: { experiment: { id: experiment.id } },
    });
    if (published) throw new EntityInUse();
    await this.experimentRepository.delete({ id: experiment.id });
    this.logger.log("Experiment deleted", {
      experimentId: experiment.id,
      organizationId: orgId,
      userId: user.userId,
    });
  }

  private async findInOrg(
    orgId: string,
    experimentId: string,
  ): Promise<Experiment> {
    return findExperimentInOrg(this.experimentRepository, orgId, experimentId);
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
    const runCount = Object.values(runCounts).reduce((a, b) => a + b, 0);
    return {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      retries: experiment.retries,
      grid_interval: experiment.grid_interval,
      grid_count: experiment.grid_count,
      grid_dates: snapshotGrid(
        experiment.created_on,
        experiment.grid_interval,
        experiment.grid_count,
      ).flatMap((snapshot) =>
        snapshot.grid_date ? [gridDay(snapshot.grid_date)] : [],
      ),
      analysis_budget: experiment.analysis_budget ?? null,
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
      run_count: runCount,
      run_counts: runCounts,
      // One run per entry per snapshot
      estimated_analyses: estimateAnalyses(
        Math.round(runCount / (experiment.grid_count + 1)),
        experiment.grid_count,
      ),
    };
  }
}

/**
 * An experiment of the org with its creator, dataset and analyzer.
 * @throws {EntityNotFound} If the org has no such experiment
 */
export async function findExperimentInOrg(
  repository: Repository<Experiment>,
  orgId: string,
  experimentId: string,
): Promise<Experiment> {
  const experiment = await repository.findOne({
    where: { id: experimentId, organization: { id: orgId } },
    relations: SUMMARY_RELATIONS,
  });
  if (!experiment) throw new EntityNotFound();
  return experiment;
}

export function creatorName(experiment: Experiment): string | null {
  const creator = experiment.created_by;
  return creator ? `${creator.first_name} ${creator.last_name}` : null;
}

function emptyRunCounts(): ExperimentRunCounts {
  return {
    [ExperimentRunStatus.PENDING]: 0,
    [ExperimentRunStatus.DONE]: 0,
    [ExperimentRunStatus.FAILED]: 0,
    [ExperimentRunStatus.SKIPPED]: 0,
  };
}
