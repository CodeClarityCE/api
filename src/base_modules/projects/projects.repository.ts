import { Injectable } from '@nestjs/common';
import { Project } from 'src/base_modules/projects/project.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntityNotFound } from 'src/types/errors/types';

@Injectable()
export class ProjectsRepository {
    constructor(
        @InjectRepository(Project, 'codeclarity')
        private projectRepository: Repository<Project>,
    ) {}

    async getProjectById(projectId: string): Promise<Project> {
        const project = await this.projectRepository.findOne({
            relations: {
                integration: true
            },
            where: { id: projectId }
        });

        if (!project) {
            throw new EntityNotFound();
        }

        return project
    }

    async getProjectByIdAndOrganization(projectId: string, organizationId: string): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: {
                id: projectId,
                organizations: {
                    id: organizationId
                }
            },
            relations: {
                added_by: true
            }
        });

        if (!project) {
            throw new EntityNotFound();
        }

        return project
    }
}
