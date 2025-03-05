import { Injectable } from '@nestjs/common';
import { Project } from 'src/base_modules/projects/project.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntityNotFound, NotAuthorized, ProjectDoesNotExist } from 'src/types/errors/types';

@Injectable()
export class ProjectsRepository {
    constructor(
        @InjectRepository(Project, 'codeclarity')
        private projectRepository: Repository<Project>,
    ) { }

    async getProjectById(projectId: string, relations?: object): Promise<Project> {
        const project = await this.projectRepository.findOne({
            relations: relations,
            where: { id: projectId }
        });

        if (!project) {
            throw new EntityNotFound();
        }

        return project
    }

    async getProjectByIdAndOrganization(projectId: string, organizationId: string, relations?: object): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: {
                id: projectId,
                organizations: {
                    id: organizationId
                }
            },
            relations: relations
        });

        if (!project) {
            throw new ProjectDoesNotExist();
        }

        return project
    }

    /**
        * Checks whether the integration, with the given id, belongs to the organization, with the given id
        * @param integrationId The id of the integration
        * @param orgId The id of the organization
        * @returns whether or not the integration belongs to the org
        */
    async doesProjectBelongToOrg(projectId: string, orgId: string) {
        const belongs = await this.projectRepository.exists({
            relations: {
                organizations: true
            },
            where: {
                id: projectId,
                organizations: {
                    id: orgId
                }
            }
        });
        if (!belongs) {
            throw new NotAuthorized();
        }
    }

    async deleteProject(projectId: string) {
        await this.projectRepository.delete(projectId)
    }
}
