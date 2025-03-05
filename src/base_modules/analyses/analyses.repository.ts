import { Injectable } from '@nestjs/common';
import {
    EntityNotFound,
    NotAuthorized,
} from 'src/types/errors/types';
import { TypedPaginatedData } from 'src/types/paginated/types';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class AnalysesRepository {
    constructor(
        @InjectRepository(Analysis, 'codeclarity')
        private analysisRepository: Repository<Analysis>,
    ) { }

    async saveAnalysis(analysis: Analysis): Promise<Analysis> {
        return await this.analysisRepository.save(analysis)
    }

    async deleteAnalysis(analysisId: string) {
        await this.analysisRepository.delete(analysisId)
    }

    async getAnalysisById(analysisId: string, relation?: object): Promise<Analysis> {
        const analysis = await this.analysisRepository.findOne({
            where: {
                id: analysisId
            },
            relations: {}
        })

        if (!analysis) {
            throw new EntityNotFound()
        }

        return analysis
    }

    async getAnalysisByProjectId(projectId: string, currentPage: number, entriesPerPage: number): Promise<TypedPaginatedData<Analysis>> {
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

    /**
        * Checks whether the analyses, with the given id, belongs to the project, with the given id
        * @param analysisId The id of the analyses
        * @param projectId The id of the project
        * @returns whether or not the project belongs to the org
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
}
