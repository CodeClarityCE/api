import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Analysis } from "src/base_modules/analyses/analysis.entity";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";
import { TypedPaginatedData } from "src/types/pagination.types";
import { In, Repository } from "typeorm";

/**
 * Pure repository for analysis database operations.
 * Does NOT depend on other repositories - cross-entity logic belongs in services.
 */
@Injectable()
export class AnalysesRepository {
  constructor(
    @InjectRepository(Analysis, "codeclarity")
    private analysisRepository: Repository<Analysis>,
  ) {}

  /**
   * Save an analysis to the database.
   */
  async saveAnalysis(analysis: Analysis): Promise<Analysis> {
    return this.analysisRepository.save(analysis);
  }

  /**
   * Delete an analysis by ID.
   */
  async deleteAnalysis(analysisId: string): Promise<void> {
    await this.analysisRepository.delete(analysisId);
  }

  /**
   * Remove multiple analyses.
   */
  async removeAnalyses(analyses: Analysis[]): Promise<void> {
    await this.analysisRepository.remove(analyses);
  }

  /**
   * Get an analysis by ID.
   * @throws {EntityNotFound} if not found.
   */
  async getAnalysisById(
    analysisId: string,
    relation?: object,
  ): Promise<Analysis> {
    const analysis = await this.analysisRepository.findOne({
      where: { id: analysisId },
      ...(relation ? { relations: relation } : {}),
    });
    if (!analysis) {
      throw new EntityNotFound();
    }

    return analysis;
  }

  /**
   * Get paginated analyses for a project.
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

  /**
   * Get all analyses for a project.
   */
  async getAnalysesByProjectId(
    projectId: string,
    relations?: object,
  ): Promise<Analysis[]> {
    return this.analysisRepository.find({
      where: { project: { id: projectId } },
      ...(relations ? { relations: relations } : {}),
    });
  }

  /**
   * Check if an analysis belongs to a project.
   * @throws {NotAuthorized} if not.
   */
  async doesAnalysesBelongToProject(
    analysisId: string,
    projectId: string,
  ): Promise<void> {
    const belongs = await this.analysisRepository.findOne({
      relations: ["project"],
      where: {
        id: analysisId,
        project: { id: projectId },
      },
    });
    if (!belongs) {
      throw new NotAuthorized();
    }
  }

  /**
   * Get scheduled analyses for a project.
   */
  async getScheduledAnalysesByProjectId(
    projectId: string,
  ): Promise<Analysis[]> {
    return this.analysisRepository.find({
      where: {
        project: { id: projectId },
        schedule_type: In(["daily", "weekly"]),
        is_active: true,
      },
      relations: ["analyzer", "created_by"],
      order: { next_scheduled_run: "ASC" },
    });
  }
}
