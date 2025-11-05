import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Project } from 'src/base_modules/projects/project.entity';
import { EntityNotFound, NotAuthorized, ProjectDoesNotExist } from 'src/types/error.types';
import { TypedPaginatedData } from 'src/types/pagination.types';
import { SortDirection } from 'src/types/sort.types';
import { Repository } from 'typeorm';


import { AllowedOrderByGetProjects } from './projects.service';


@Injectable()
export class ProjectsRepository {
    constructor(
        @InjectRepository(Project, 'codeclarity')
        private projectRepository: Repository<Project>
    ) {}

    async getProjectById(projectId: string, relations?: object): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: { id: projectId },
            ...(relations ? { relations: relations } : {})
        });

        if (!project) {
            throw new EntityNotFound();
        }

        return project;
    }

    async getProjectByIdAndOrganization(
        projectId: string,
        organizationId: string,
        relations?: object
    ): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: {
                id: projectId,
                organizations: {
                    id: organizationId
                }
            },
            ...(relations ? { relations: relations } : {})
        });

        if (!project) {
            throw new ProjectDoesNotExist();
        }

        return project;
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
        await this.projectRepository.delete(projectId);
    }

    async deleteUserProjects(userId: string) {
        const projects = await this.projectRepository.find({ where: { added_by: { id: userId } } });
        await this.projectRepository.remove(projects);
    }

    async saveProject(project: Project): Promise<Project> {
        return this.projectRepository.save(project);
    }

    async getManyProjects(
        orgId: string,
        currentPage: number,
        entriesPerPage: number,
        searchKey?: string,
        _sortBy?: AllowedOrderByGetProjects,
        _sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<Project>> {
        let queryBuilder = this.projectRepository
            .createQueryBuilder('project')
            .leftJoin('project.organizations', 'organizations')
            .where('organizations.id = :orgId', { orgId: orgId })
            .leftJoinAndSelect('project.analyses', 'analyses')
            .leftJoinAndSelect('analyses.analyzer', 'analyzer')
            .leftJoinAndSelect('project.files', 'files')
            .leftJoinAndSelect('project.added_by', 'added_by')
            .orderBy('project.added_on', 'DESC')
            .addOrderBy('analyses.created_on', 'DESC');

        // if (sortBy && sortDirection) {
        //     if (sortBy === AllowedOrderByGetProjects.NAME)
        //         queryBuilder = queryBuilder.orderBy('name', sortDirection);
        //     else if (sortBy === AllowedOrderByGetProjects.IMPORTED_ON)
        //         queryBuilder = queryBuilder.orderBy('added_on', sortDirection);
        // }

        if (searchKey) {
            queryBuilder = queryBuilder.andWhere(
                '(project.name LIKE :searchKey OR project.description LIKE :searchKey)',
                { searchKey: `%${searchKey}%` }
            );
        }

        const fullCount = await queryBuilder.getCount();

        queryBuilder = queryBuilder.limit(entriesPerPage).offset(currentPage * entriesPerPage);

        const projects = await queryBuilder.getMany();

        return {
            data: projects,
            page: currentPage,
            entry_count: projects.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: fullCount, // once you apply filters this needs to change
            filter_count: {}
        };
    }
}
