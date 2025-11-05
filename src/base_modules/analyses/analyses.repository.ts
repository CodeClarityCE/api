import { Injectable } from '@nestjs/common';
import { EntityNotFound, NotAuthorized } from 'src/types/error.types';
import { TypedPaginatedData } from 'src/types/pagination.types';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

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
        @InjectRepository(Analysis, 'codeclarity')
        private analysisRepository: Repository<Analysis>
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
    async deleteAnalysis(analysisId: string) {
        await this.analysisRepository.delete(analysisId);
    }

    /**
     * Deletes an analysis from the database by its ID.
     * @param analysisId The ID of the analysis to be deleted.
     */
    async removeAnalyses(analyses: Analysis[]) {
        await this.analysisRepository.remove(analyses);
    }

    /**
     * Retrieves an analysis by its ID, optionally including related entities.
     * @param analysisId The ID of the analysis to retrieve.
     * @param relation An object specifying which relations to include in the result. Defaults to an empty object.
     * @returns A promise that resolves with the retrieved analysis or throws an EntityNotFound error if not found.
     */
    async getAnalysisById(analysisId: string, relation?: object): Promise<Analysis> {
        const analysis = await this.analysisRepository.findOne({
            where: {
                id: analysisId
            },
            ...(relation ? { relations: relation } : {})
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
        entriesPerPage: number
    ): Promise<TypedPaginatedData<Analysis>> {
        const analysisQueryBuilder = this.analysisRepository
            .createQueryBuilder('analysis')
            .orderBy('analysis.created_on', 'DESC')
            .where('analysis.projectId = :projectId', { projectId });

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
            filter_count: {}
        };
    }

    async getAnalysesByProjectId(projectId: string, relations?: object): Promise<Analysis[]> {
        return this.analysisRepository.find({
            where: {
                project: { id: projectId }
            },
            ...(relations ? { relations: relations } : {})
        });
    }

    /**
     * Checks whether an analysis belongs to a given project.
     * @param analysisId The ID of the analysis to check.
     * @param projectId The ID of the project to check against.
     * @throws NotAuthorized if the analysis does not belong to the project.
     */
    async doesAnalysesBelongToProject(analysisId: string, projectId: string) {
        const belongs = await this.analysisRepository.findOne({
            relations: ['project'],
            where: {
                id: analysisId,
                project: {
                    id: projectId
                }
            }
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
    async getScheduledAnalysesByProjectId(projectId: string): Promise<Analysis[]> {
        return this.analysisRepository.find({
            where: {
                project: { id: projectId },
                schedule_type: In(['daily', 'weekly']), // Only recurring schedules
                is_active: true // Only active schedules
            },
            relations: ['analyzer', 'created_by'], // Include related data for display
            order: {
                next_scheduled_run: 'ASC' // Earliest scheduled runs first
            }
        });
    }
}
