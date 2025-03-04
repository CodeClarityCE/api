import { Injectable } from '@nestjs/common';
import { TypedPaginatedData } from 'src/types/paginated/types';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/paginated/types';
import { EntityNotFound, IntegrationNotSupported, NotAuthorized } from 'src/types/errors/types';
import { AuthenticatedUser } from 'src/types/auth/types';
import { OrganizationLoggerService } from 'src/base_modules/organizations/organizationLogger.service';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { ProjectMemberService } from './projectMember.service';
import { SortDirection } from 'src/types/sort/types';
import { GithubRepositoriesService } from '../integrations/github/githubRepos.service';
import { GitlabRepositoriesService } from '../integrations/gitlab/gitlabRepos.service';
import { ProjectImportBody } from 'src/types/entities/frontend/Project';
import { IntegrationProvider } from 'src/types/entities/frontend/Integration';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { ActionType } from 'src/types/entities/frontend/OrgAuditLog';
import { Integration } from 'src/entity/codeclarity/Integration';
import { RepositoryCache } from 'src/entity/codeclarity/RepositoryCache';
import { IntegrationType, Project } from 'src/entity/codeclarity/Project';
import { User } from 'src/entity/codeclarity/User';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Result } from 'src/entity/codeclarity/Result';
import { join } from 'path';
import { existsSync } from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mkdir, rm } from 'fs/promises';
import { File } from 'src/entity/codeclarity/File';

export enum AllowedOrderByGetProjects {
    IMPORTED_ON = 'imported_on',
    NAME = 'url'
}

@Injectable()
export class ProjectService {
    constructor(
        private readonly organizationLoggerService: OrganizationLoggerService,
        private readonly organizationsMemberService: OrganizationsMemberService,
        private readonly projectMemberService: ProjectMemberService,
        private readonly githubRepositoriesService: GithubRepositoriesService,
        private readonly gitlabRepositoriesService: GitlabRepositoriesService,
        @InjectRepository(Project, 'codeclarity')
        private projectRepository: Repository<Project>,
        @InjectRepository(User, 'codeclarity')
        private userRepository: Repository<User>,
        @InjectRepository(Analysis, 'codeclarity')
        private analysisRepository: Repository<Analysis>,
        @InjectRepository(Organization, 'codeclarity')
        private organizationRepository: Repository<Organization>,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>,
        @InjectRepository(File, 'codeclarity')
        private fileRepository: Repository<File>,
        @InjectRepository(Integration, 'codeclarity')
        private integrationRepository: Repository<Integration>,
        @InjectRepository(OrganizationMemberships, 'codeclarity')
        private membershipRepository: Repository<OrganizationMemberships>
    ) {}

    /**
     * Import a source code project
     * @throws {IntegrationNotSupported}
     * @throws {AlreadyExists}
     * @throws {EntityNotFound}
     * @throws {NotAuthorized}
     *
     * @param orgId The id of the organization
     * @param projectData The project data
     * @param user The authenticated user
     * @returns the id of the created project
     */
    async import(
        orgId: string,
        projectData: ProjectImportBody,
        user: AuthenticatedUser
    ): Promise<string> {
        // (1) Check that the user is a member of the org
        await this.organizationsMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const project = new Project();

        if (projectData.integration_id) {
            const integration = await this.integrationRepository.findOne({
                relations: {
                    organizations: true,
                    users: true
                },
                where: {
                    id: projectData.integration_id,
                    organizations: {
                        id: orgId
                    },
                    users: {
                        id: user.userId
                    }
                }
            });

            if (!integration) {
                throw new EntityNotFound();
            }

            // (2) Check that the integration belongs to the org
            if (integration.organizations.find((org) => org.id == orgId) == undefined) {
                throw new NotAuthorized();
            }

            let repo: RepositoryCache;

            if (integration.integration_provider == IntegrationProvider.GITHUB) {
                await this.githubRepositoriesService.syncGithubRepos(projectData.integration_id);
                try {
                    repo = await this.githubRepositoriesService.getGithubRepository(
                        orgId,
                        projectData.integration_id,
                        projectData.url,
                        user
                    );
                } catch (err) {
                    if (err instanceof EntityNotFound) {
                        // Our cache might be out of sync
                        // So refresh cache and try again
                        repo = await this.githubRepositoriesService.getGithubRepository(
                            orgId,
                            projectData.integration_id,
                            projectData.url,
                            user,
                            true
                        );
                    }
                    throw err;
                }
            } else if (integration.integration_provider == IntegrationProvider.GITLAB) {
                await this.gitlabRepositoriesService.syncGitlabRepos(projectData.integration_id);
                try {
                    repo = await this.gitlabRepositoriesService.getGitlabRepository(
                        orgId,
                        projectData.integration_id,
                        projectData.url,
                        user
                    );
                } catch (err) {
                    if (err instanceof EntityNotFound) {
                        // Our cache might be out of sync
                        // So refresh cache and try again
                        repo = await this.gitlabRepositoriesService.getGitlabRepository(
                            orgId,
                            projectData.integration_id,
                            projectData.url,
                            user,
                            true
                        );
                    }
                    throw err;
                }
            } else {
                throw new IntegrationNotSupported();
            }

            project.name = repo.fully_qualified_name;
            project.description = repo.description;
            project.type = integration.integration_provider;
            project.integration = integration;
            project.default_branch = repo.default_branch;
            project.service_domain = repo.service_domain;
            project.integration_provider = integration.integration_provider;
            project.url = projectData.url;
        } else {
            project.name = projectData.name;
            project.description = projectData.description;
            project.type = IntegrationProvider.FILE;
            project.url = '';
            // project.integration = integration;
            project.default_branch = '';
            project.service_domain = '';
            project.integration_provider = IntegrationProvider.FILE;
        }

        const user_adding = await this.userRepository.findOneOrFail({
            where: {
                id: user.userId
            }
        });

        const organization = await this.organizationRepository.findOneOrFail({
            where: {
                id: orgId
            }
        });

        project.downloaded = false;
        project.added_on = new Date();
        project.added_by = user_adding;
        project.organizations = [organization];
        project.integration_type = IntegrationType.VCS;
        project.invalid = false;

        const added_project = await this.projectRepository.save(project);

        const folderPath = join('/private', organization.id, "projects", added_project.id);
        await mkdir(folderPath, { recursive: true });

        await this.organizationLoggerService.addAuditLog(
            ActionType.ProjectCreate,
            `The User imported repository ${projectData.url} to the organization.`,
            orgId,
            user.userId
        );

        return added_project.id;
    }

    /**
     * Get a project
     * @throws {NotAuthorized}
     * @throws {EntityNotFound}
     *
     * @param organizationId The id of the organizaiton
     * @param id The id of the project
     * @param user The authenticated user
     * @returns the project
     */
    async get(organizationId: string, id: string, user: AuthenticatedUser): Promise<Project> {
        // (1) Every member of an org can retrieve a project
        await this.organizationsMemberService.hasRequiredRole(
            organizationId,
            user.userId,
            MemberRole.USER
        );

        // (2) Check if project belongs to org
        const isProjectOfOrg = await this.projectMemberService.doesProjectBelongToOrg(
            id,
            organizationId
        );
        if (!isProjectOfOrg) {
            throw new NotAuthorized();
        }

        const project = await this.projectRepository.findOneOrFail({
            where: {
                id: id
            },
            relations: {
                files: true,
                added_by: true
            }
        });

        return project;
    }

    /**
     * Get many projects of the org
     * @throws {NotAuthorized}
     *
     * @param orgId The id of the org
     * @param paginationUserSuppliedConf Paginiation configuration
     * @param user The authenticatéd user
     * @param searchKey A search key to filter the records by
     * @param sortBy A sort field to sort the records by
     * @param sortDirection A sort direction
     * @returns
     */
    async getMany(
        orgId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser,
        searchKey?: string,
        sortBy?: AllowedOrderByGetProjects,
        sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<Project>> {
        // Every member of an org can retrieve all project
        await this.organizationsMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        let currentPage = 0;

        if (paginationUserSuppliedConf.entriesPerPage)
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                paginationUserSuppliedConf.entriesPerPage
            );

        if (paginationUserSuppliedConf.currentPage)
            currentPage = Math.max(0, paginationUserSuppliedConf.currentPage);

        let projectRepository = await this.projectRepository.createQueryBuilder('project');
        projectRepository = projectRepository
            .leftJoin('project.organizations', 'organizations')
            .where('organizations.id = :orgId', { orgId: orgId })
            .leftJoinAndSelect('project.analyses', 'analyses')
            .orderBy('analyses.created_on', 'DESC')
            .leftJoinAndSelect('analyses.analyzer', 'analyzer')
            .leftJoinAndSelect('project.files', 'files')
            .leftJoinAndSelect('project.added_by', 'added_by');

        if (sortBy) {
            if (sortBy == AllowedOrderByGetProjects.NAME)
                projectRepository = projectRepository.orderBy('name', sortDirection);
            else if (sortBy == AllowedOrderByGetProjects.IMPORTED_ON)
                projectRepository = projectRepository.orderBy('added_on', sortDirection);
        }

        if (searchKey) {
            projectRepository = projectRepository.andWhere(
                '(project.name LIKE :searchKey OR project.description LIKE :searchKey)',
                { searchKey: `%${searchKey}%` }
            );
        }

        const fullCount = await projectRepository.getCount();

        projectRepository = projectRepository
            .limit(entriesPerPage)
            .offset(currentPage * entriesPerPage);

        const projects = await projectRepository.getMany();

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

    /**
     * Delete a project of an org
     * @throws {NotAuthorized}
     * @throws {EntityNotFound}
     *
     * @param orgId The id of the org
     * @param id The id of the project
     * @param user The authenticated user
     */
    async delete(orgId: string, id: string, user: AuthenticatedUser): Promise<void> {
        // (1) Check that member is at least a user
        await this.organizationsMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if project belongs to org

        const isProjectOfOrg = await this.projectRepository.exists({
            relations: ['organizations'],
            where: {
                id: id,
                organizations: {
                    id: orgId
                }
            }
        });

        if (!isProjectOfOrg) {
            throw new NotAuthorized();
        }

        const membership = await this.membershipRepository.findOne({
            relations: {
                organization: true
            },
            where: {
                organization: {
                    id: orgId
                },
                user: {
                    id: user.userId
                }
            },
            select: {
                role: true,
                organizationMembershipId: true
            }
        });

        if (!membership) {
            throw new EntityNotFound();
        }

        const memberRole = membership.role;

        const project = await this.projectRepository.findOneOrFail({
            where: {
                id: id
            },
            relations: {
                files: true,
                added_by: true
            }
        });

        // Every moderator, admin or owner can remove a project.
        // a normal user can also delete it, iff he is the one that added the project
        if (memberRole == MemberRole.USER) {
            // Get edge and check if added_by == user.userId
            if (!project.added_by || project.added_by.id != user.userId) {
                throw new NotAuthorized();
            }
        }

        const organization = await this.organizationRepository.findOneOrFail({
            relations: ['projects'],
            where: {
                id: orgId
            }
        });
        organization.projects = organization.projects.filter((p) => p.id != id);
        await this.organizationRepository.save(organization);

        const analyses = await this.analysisRepository.find({
            where: {
                project: project
            },
            relations: {
                results: true
            }
        });
        for (const analysis of analyses) {
            for (const result of analysis.results) {
                await this.resultRepository.remove(result);
            }

            await this.analysisRepository.remove(analysis);
        }

        // Remove project folder
        const filePath = join('/private', organization.id, "projects", project.id);
        if (existsSync(filePath)) {
            await rm(filePath, {recursive: true, force: true});
        }

        for (const file of project.files) {
            await this.fileRepository.remove(file)
        }

        await this.projectRepository.delete(id);

        await this.organizationLoggerService.addAuditLog(
            ActionType.ProjectDelete,
            `The User removed project ${project.url} from the organization.`,
            orgId,
            user.userId
        );
    }
}
