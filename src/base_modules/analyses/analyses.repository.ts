import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, LessThan, Not, Repository } from "typeorm";

import {
  Analysis,
  AnalysisStatus,
} from "src/base_modules/analyses/analysis.entity";
import { TERMINAL_ANALYSIS_STATUSES } from "src/base_modules/analyses/analysis-outcome";
import { Result } from "src/codeclarity_modules/results/result.entity";
import { EntityNotFound } from "src/types/error.types";
import { TypedPaginatedData } from "src/types/pagination.types";
import { paginatedData } from "src/utils/pagination";

/** Caller writes committed in the same transaction as a new analysis. */
export type AnalysisWrites = (
  manager: EntityManager,
  analysisId: string,
) => Promise<void>;

/**
 * A repository for handling analysis-related database operations.
 */
@Injectable()
export class AnalysesRepository {
  /**
   * Constructs a new instance of the AnalysesRepository class.
   * @param analysisRepository The TypeORM repository for Analysis entities.
   */
  constructor(
    @InjectRepository(Analysis, "codeclarity")
    private analysisRepository: Repository<Analysis>,
  ) {}

  /**
   * Saves an analysis to the database.
   * @param analysis The analysis to be saved.
   * @param inTransaction Writes to commit atomically with the analysis.
   * @returns A promise that resolves with the saved analysis.
   */
  async saveAnalysis(
    analysis: Analysis,
    inTransaction?: AnalysisWrites,
  ): Promise<Analysis> {
    if (!inTransaction) return await this.analysisRepository.save(analysis);
    // Commit the analysis together with the caller's own writes
    return await this.analysisRepository.manager.transaction(
      async (manager) => {
        const saved = await manager.save(analysis);
        await inTransaction(manager, saved.id);
        return saved;
      },
    );
  }

  /**
   * Deletes an analysis from the database by its ID.
   * @param analysisId The ID of the analysis to be deleted.
   */
  async deleteAnalysis(analysisId: string): Promise<void> {
    await this.analysisRepository.delete(analysisId);
  }

  /**
   * Deletes an analysis from the database by its ID.
   * @param analysisId The ID of the analysis to be deleted.
   */
  async removeAnalyses(analyses: Analysis[]): Promise<void> {
    await this.analysisRepository.remove(analyses);
  }

  /**
   * Deletes analyses with their policy links and results, all or nothing.
   * @param ids The IDs of the analyses to delete.
   * @param manager Runs the deletes in the caller's transaction when given.
   * @returns The number of analyses removed.
   */
  async deleteByIds(ids: string[], manager?: EntityManager): Promise<number> {
    if (ids.length === 0) return 0;
    if (!manager) {
      return this.analysisRepository.manager.transaction((m) =>
        this.deleteByIds(ids, m),
      );
    }
    // The join table and result keys do not cascade, so clear them first
    await manager
      .createQueryBuilder()
      .delete()
      .from("policy_analyses_analysis")
      .where('"analysisId" IN (:...ids)', { ids })
      .execute();
    await manager
      .createQueryBuilder()
      .delete()
      .from(Result)
      .where('"analysisId" IN (:...ids)', { ids })
      .execute();
    const res = await manager.delete(Analysis, { id: In(ids) });
    return res.affected ?? 0;
  }

  /** Runs the given work in one database transaction. */
  async runInTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.analysisRepository.manager.transaction(work);
  }

  /**
   * Cancels (sets status to CANCELLED) every non-terminal analysis among the
   * given IDs in a single set-based statement. Terminal analyses are left
   * untouched so a finished/failed run is never re-labelled.
   * @param ids The IDs of the analyses to cancel.
   * @param manager Runs the update in the caller's transaction when given.
   * @returns The number of analyses transitioned to CANCELLED.
   */
  async cancelByIds(ids: string[], manager?: EntityManager): Promise<number> {
    if (ids.length === 0) return 0;
    const repo = manager?.getRepository(Analysis) ?? this.analysisRepository;
    const res = await repo.update(
      { id: In(ids), status: Not(In([...TERMINAL_ANALYSIS_STATUSES])) },
      { status: AnalysisStatus.CANCELLED, ended_on: new Date() },
    );
    return res.affected ?? 0;
  }

  /**
   * Returns the IDs of every analysis belonging to any of the given projects.
   * @param projectIds The IDs of the projects to look up analyses for.
   * @param manager Reads inside the caller's transaction when given.
   */
  async getAnalysisIdsByProjectIds(
    projectIds: string[],
    manager?: EntityManager,
  ): Promise<string[]> {
    if (projectIds.length === 0) return [];
    const repo = manager?.getRepository(Analysis) ?? this.analysisRepository;
    const rows = await repo.find({
      select: { id: true },
      where: { project: { id: In(projectIds) } },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Returns the id and status of every analysis belonging to a project. Used by
   * the batch cancel/delete endpoints to validate ownership and decide per-id
   * outcomes (cancellable vs already-terminal) in a single query.
   * @param projectId The id of the project to look up analyses for.
   */
  async getIdStatusByProjectId(
    projectId: string,
  ): Promise<{ id: string; status: AnalysisStatus }[]> {
    return this.analysisRepository.find({
      select: { id: true, status: true },
      where: { project: { id: projectId } },
    });
  }

  /**
   * Retrieves an analysis by its ID, optionally including related entities.
   * @param analysisId The ID of the analysis to retrieve.
   * @param relation An object specifying which relations to include in the result. Defaults to an empty object.
   * @returns A promise that resolves with the retrieved analysis or throws an EntityNotFound error if not found.
   */
  async getAnalysisById(
    analysisId: string,
    relation?: object,
  ): Promise<Analysis> {
    const analysis = await this.analysisRepository.findOne({
      where: {
        id: analysisId,
      },
      ...(relation ? { relations: relation } : {}),
    });
    if (!analysis) {
      throw new EntityNotFound();
    }

    return analysis;
  }

  /**
   * The project's latest default-branch analysis (any label for an upload) with its analyzer, experiments excepted.
   * @throws {EntityNotFound} if it has none
   */
  async getLastDefaultBranchAnalysis(projectId: string): Promise<Analysis> {
    const analysis = await this.analysisRepository
      .createQueryBuilder("analysis")
      .innerJoin("analysis.project", "project")
      .leftJoinAndSelect("analysis.analyzer", "analyzer")
      .where("project.id = :projectId", { projectId })
      .andWhere(
        "(project.default_branch = '' OR analysis.branch = project.default_branch)",
      )
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM experiment_run r WHERE r."analysisId" = analysis.id)`,
      )
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM experiment_probe p WHERE p."analysisId" = analysis.id)`,
      )
      .orderBy("analysis.created_on", "DESC")
      .addOrderBy("analysis.id", "DESC")
      .getOne();
    if (!analysis) {
      throw new EntityNotFound();
    }
    return analysis;
  }

  /**
   * Retrieves a paginated list of analyses for a given project, sorted by creation date in descending order.
   * @param projectId The ID of the project to retrieve analyses for.
   * @param currentPage The current page number (0-indexed).
   * @param entriesPerPage The number of entries per page.
   * @returns A promise that resolves with a paginated data object containing the list of analyses and pagination metadata.
   */
  async getAnalysisByProjectId(
    projectId: string,
    currentPage: number,
    entriesPerPage: number,
  ): Promise<TypedPaginatedData<Analysis>> {
    const analysisQueryBuilder = this.analysisRepository
      .createQueryBuilder("analysis")
      .orderBy("analysis.created_on", "DESC")
      .where("analysis.projectId = :projectId", { projectId });

    const fullCount = await analysisQueryBuilder.getCount();

    const analyses = await analysisQueryBuilder
      .skip(currentPage * entriesPerPage)
      .take(entriesPerPage)
      .getMany();

    return paginatedData(
      analyses,
      fullCount,
      { currentPage, entriesPerPage },
      analyses.length,
    );
  }

  /** Finds the latest completed analysis before the given one, on the same branch and analyzer. */
  async getPreviousCompletedAnalysis(
    projectId: string,
    analysisId: string,
  ): Promise<Analysis | null> {
    const current = await this.getAnalysisById(analysisId, { analyzer: true });
    if (!current.analyzer) return null;
    return this.analysisRepository.findOne({
      where: {
        project: { id: projectId },
        branch: current.branch,
        analyzer: { id: current.analyzer.id },
        status: In([AnalysisStatus.COMPLETED, AnalysisStatus.SUCCESS]),
        created_on: LessThan(current.created_on),
      },
      order: { created_on: "DESC" },
    });
  }

  async getAnalysesByProjectId(
    projectId: string,
    relations?: object,
  ): Promise<Analysis[]> {
    return this.analysisRepository.find({
      where: {
        project: { id: projectId },
      },
      ...(relations ? { relations: relations } : {}),
    });
  }

  /**
   * Checks whether an analysis belongs to a given project.
   * @param analysisId The ID of the analysis to check.
   * @param projectId The ID of the project to check against.
   * @throws EntityNotFound if the analysis does not belong to the project.
   */
  async doesAnalysesBelongToProject(
    analysisId: string,
    projectId: string,
  ): Promise<void> {
    const belongs = await this.analysisRepository.findOne({
      relations: { project: true },
      where: {
        id: analysisId,
        project: {
          id: projectId,
        },
      },
    });
    if (!belongs) {
      throw new EntityNotFound();
    }
  }

  /**
   * Retrieve all active scheduled analyses for a specific project
   *
   * Returns analyses that are configured for recurring execution (daily/weekly)
   * and are currently active. Used to display scheduled analyses to users
   * and by the scheduler to determine which analyses to execute.
   *
   * @param projectId - The ID of the project to get scheduled analyses for
   * @returns Promise resolving to array of scheduled Analysis objects
   * @returns Includes analyzer and created_by relations for display purposes
   * @returns Sorted by next_scheduled_run (earliest first) for scheduler priority
   */
  async getScheduledAnalysesByProjectId(
    projectId: string,
  ): Promise<Analysis[]> {
    return this.analysisRepository.find({
      where: {
        project: { id: projectId },
        schedule_type: In(["daily", "weekly"]), // Only recurring schedules
        is_active: true, // Only active schedules
      },
      relations: { analyzer: true, created_by: true }, // Include related data for display
      order: {
        next_scheduled_run: "ASC", // Earliest scheduled runs first
      },
    });
  }
}
