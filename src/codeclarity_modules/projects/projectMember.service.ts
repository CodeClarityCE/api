import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Project } from 'src/entity/codeclarity/Project';
import { Repository } from 'typeorm';

@Injectable()
export class ProjectMemberService {
    constructor(
        @InjectRepository(Project, 'codeclarity')
        private projectRepository: Repository<Project>
    ) {}

    /**
     * Checks whether the project, with the given id, belongs to the organization, with the given id
     * @param projectId The id of the project
     * @param orgId The id of the organization
     * @returns whether or not the project belongs to the org
     */
    async doesProjectBelongToOrg(projectId: string, orgId: string): Promise<boolean> {
        const project = await this.projectRepository.findOne({
            relations: {
                organizations: true
            },
            where: { id: projectId, organizations: { id: orgId } }
        });
        if (!project) {
            return false;
        }
        return true;
    }
}
