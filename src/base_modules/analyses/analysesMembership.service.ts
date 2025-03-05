import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { NotAuthorized } from 'src/types/errors/types';
import { Repository } from 'typeorm';

@Injectable()
export class AnalysesMemberService {
    constructor(
        @InjectRepository(Analysis, 'codeclarity')
        private analysisRepository: Repository<Analysis>
    ) {}

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
