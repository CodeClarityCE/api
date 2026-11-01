import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";

import {
  Analysis,
  AnalysisStatus,
} from "src/base_modules/analyses/analysis.entity";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";
import { TypedPaginatedData } from "src/types/pagination.types";

/**
 * Statuses considered terminal: an analysis in one of these states is no longer
 * advancing through stages, so it is neither cancellable nor in-flight. The list
 * spans both the TypeScript and Go status spellings since worker-written rows use
 * the Go enum values ("failure" vs "failed").
 */
export const TERMINAL_ANALYSIS_STATUSES: string[] = [
  AnalysisStatus.COMPLETED,
  AnalysisStatus.SUCCESS,
  AnalysisStatus.FAILED,
  AnalysisStatus.CANCELLED,
  "failure",
];

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
   * @returns A promise that resolves with the saved analysis.
   */
  async saveAnalysis(analysis: Analysis): Promise<Analysis> {
    return await this.analysisRepository.save(analysis);
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
   * Deletes multiple analyses in a single set-based statement.
   * @param ids The IDs of the analyses to delete.
   * @returns The number of rows removed.
   */
  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.analysisRepository.delete({ id: In(ids) });
    return res.affected ?? 0;
  }

  /**
   * Cancels (sets status to CANCELLED) every non-terminal analysis among the
   * given IDs in a single set-based statement. Terminal analyses are left
   * untouched so a finished/failed run is never re-labelled.
   * @param ids The IDs of the analyses to cancel.
   * @returns The number of analyses transitioned to CANCELLED.
   */
  async cancelByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.analysisRepository.update(
      { id: In(ids), status: Not(In(TERMINAL_ANALYSIS_STATUSES)) },
      { status: AnalysisStatus.CANCELLED, ended_on: new Date() },
    );
    return res.affected ?? 0;
  }

  /**
   * Returns the IDs of every analysis belonging to any of the given projects.
   * @param projectIds The IDs of the projects to look up analyses for.
   */
  async getAnalysisIdsByProjectIds(projectIds: string[]): Promise<string[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.analysisRepository.find({
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

    return {
      data: analyses,
      page: currentPage,
      entry_count: analyses.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: analyses.length,
      filter_count: {},
    };
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
   * @throws NotAuthorized if the analysis does not belong to the project.
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
      throw new NotAuthorized();
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
