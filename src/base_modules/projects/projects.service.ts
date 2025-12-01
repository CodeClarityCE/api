import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { IntegrationProvider as IntegrationProviderEntity } from 'src/base_modules/integrations/integrations.entity';
import { OrganizationLoggerService } from 'src/base_modules/organizations/log/organizationLogger.service';
import { ActionType } from 'src/base_modules/organizations/log/orgAuditLog.types';
import { MemberRole } from 'src/base_modules/organizations/memberships/organization.memberships.entity';
import {
    IntegrationProvider,
    IntegrationType,
    Project
} from 'src/base_modules/projects/project.entity';
import { ProjectImportBody } from 'src/base_modules/projects/project.types';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';
import { AnalysisResultsRepository } from 'src/codeclarity_modules/results/results.repository';
import { EntityNotFound, IntegrationNotSupported, NotAuthorized } from 'src/types/error.types';
import {
    PaginationConfig,
    PaginationUserSuppliedConf,
    TypedPaginatedData
} from 'src/types/pagination.types';
import { SortDirection } from 'src/types/sort.types';
import { validateAndJoinPath } from 'src/utils/path-validator';
import { AnalysesRepository } from '../analyses/analyses.repository';
import { FileRepository } from '../file/file.repository';
import { GithubRepositoriesService } from '../integrations/github/githubRepos.service';
import { GitlabRepositoriesService } from '../integrations/gitlab/gitlabRepos.service';
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { UsersRepository } from '../users/users.repository';
import { ProjectMemberService } from './projectMember.service';
import { ProjectsRepository } from './projects.repository';

export enum AllowedOrderByGetProjects {
    IMPORTED_ON = 'imported_on',
    NAME = 'url'
}

/** Repository services grouped for dependency injection */
interface RepositoryServices {
    users: UsersRepository;
    organizations: OrganizationsRepository;
    file: FileRepository;
    integrations: IntegrationsRepository;
    results: AnalysisResultsRepository;
    analyses: AnalysesRepository;
    projects: ProjectsRepository;
}

@Injectable()
export class ProjectService {
    private readonly repos: RepositoryServices;

    constructor(
        private readonly organizationLoggerService: OrganizationLoggerService,
        private readonly projectMemberService: ProjectMemberService,
        private readonly githubRepositoriesService: GithubRepositoriesService,
        private readonly gitlabRepositoriesService: GitlabRepositoriesService,
        usersRepository: UsersRepository,
        organizationsRepository: OrganizationsRepository,
        fileRepository: FileRepository,
        integrationsRepository: IntegrationsRepository,
        resultsRepository: AnalysisResultsRepository,
        analysesRepository: AnalysesRepository,
        projectsRepository: ProjectsRepository
    ) {
        this.repos = {
            users: usersRepository,
            organizations: organizationsRepository,
            file: fileRepository,
            integrations: integrationsRepository,
            results: resultsRepository,
            analyses: analysesRepository,
            projects: projectsRepository
        };
    }

    /**
     * Check if a repository URL is publicly accessible and create a fallback RepositoryCache
     * @param url The repository URL
     * @param serviceDomain The domain (e.g., 'github.com', 'gitlab.com')
     * @returns RepositoryCache for the public repository
     * @throws The original error if the repository is not public
     */
    private async checkPublicRepositoryAccess(
        url: string,
        serviceDomain: string,
        originalError: Error
    ): Promise<RepositoryCache> {
        const response = await fetch(url);
        if (!response.ok) {
            throw originalError;
        }
        const body = await response.text();
        if (body.includes('Page not found')) {
            throw originalError;
        }

        const repo = new RepositoryCache();
        repo.fully_qualified_name = url.replace(`https://${serviceDomain}/`, '');
        repo.description = 'Imported manually';
        repo.default_branch = 'main';
        repo.service_domain = serviceDomain;
        return repo;
    }

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
        await this.repos.organizations.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const project = new Project();

        if (projectData.integration_id) {
            const integration =
                await this.repos.integrations.getIntegrationByIdAndOrganizationAndUser(
                    projectData.integration_id,
                    orgId,
                    user.userId
                );

            let repo: RepositoryCache;

            if (integration.integration_provider === IntegrationProviderEntity.GITHUB) {
                await this.githubRepositoriesService.syncGithubRepos(projectData.integration_id);
                try {
                    repo = await this.githubRepositoriesService.getGithubRepository(
                        orgId,
                        projectData.integration_id,
                        projectData.url,
                        user
                    );
                } catch (err) {
                    if (!(err instanceof EntityNotFound)) throw err;
                    repo = await this.checkPublicRepositoryAccess(
                        projectData.url,
                        'github.com',
                        err
                    );
                }
            } else if (integration.integration_provider === IntegrationProviderEntity.GITLAB) {
                await this.gitlabRepositoriesService.syncGitlabRepos(projectData.integration_id);
                try {
                    repo = await this.gitlabRepositoriesService.getGitlabRepository(
                        orgId,
                        projectData.integration_id,
                        projectData.url,
                        user
                    );
                } catch (err) {
                    if (!(err instanceof EntityNotFound)) throw err;
                    repo = await this.checkPublicRepositoryAccess(
                        projectData.url,
                        'gitlab.com',
                        err
                    );
                }
            } else {
                throw new IntegrationNotSupported();
            }

            project.name = repo.fully_qualified_name;
            project.description = repo.description;
            project.type = integration.integration_provider as unknown as IntegrationProvider;
            project.integration = integration;
            project.default_branch = repo.default_branch;
            project.service_domain = repo.service_domain;
            project.integration_provider =
                integration.integration_provider as unknown as IntegrationProvider;
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

        const user_adding = await this.repos.users.getUserById(user.userId);

        const organization = await this.repos.organizations.getOrganizationById(orgId);

        project.downloaded = false;
        project.added_on = new Date();
        project.added_by = user_adding;
        project.organizations = [organization];
        project.integration_type = IntegrationType.VCS;
        project.invalid = false;

        const added_project = await this.repos.projects.saveProject(project);

        const downloadPath = process.env['DOWNLOAD_PATH'] ?? '/private';
        const folderPath = validateAndJoinPath(
            downloadPath,
            organization.id,
            'projects',
            added_project.id
        );
        // Path is validated using validateAndJoinPath to prevent traversal attacks
        // eslint-disable-next-line security/detect-non-literal-fs-filename
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
        await this.repos.organizations.hasRequiredRole(
            organizationId,
            user.userId,
            MemberRole.USER
        );

        // (2) Check if project belongs to org
        await this.projectMemberService.doesProjectBelongToOrg(id, organizationId);

        return this.repos.projects.getProjectById(id, {
            files: true,
            added_by: true
        });
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
        _sortBy?: AllowedOrderByGetProjects,
        _sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<Project>> {
        // Every member of an org can retrieve all project
        await this.repos.organizations.hasRequiredRole(orgId, user.userId, MemberRole.USER);

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

        return this.repos.projects.getManyProjects(orgId, currentPage, entriesPerPage, searchKey);
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
        await this.repos.organizations.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if project belongs to org
        await this.repos.projects.doesProjectBelongToOrg(id, orgId);

        const membership = await this.repos.organizations.getMembershipRole(orgId, user.userId);

        if (!membership) {
            throw new EntityNotFound();
        }

        const memberRole = membership.role;

        const project = await this.repos.projects.getProjectById(id, {
            files: true,
            added_by: true
        });

        // Every moderator, admin or owner can remove a project.
        // a normal user can also delete it, iff he is the one that added the project
        if (memberRole === MemberRole.USER) {
            // Get edge and check if added_by === user.userId
            if (!project.added_by || project.added_by.id !== user.userId) {
                throw new NotAuthorized();
            }
        }

        const organization = await this.repos.organizations.getOrganizationById(orgId, {
            projects: true
        });
        organization.projects = organization.projects.filter((p) => p.id !== id);
        await this.repos.organizations.saveOrganization(organization);

        const analyses = await this.repos.analyses.getAnalysesByProjectId(project.id, {
            results: true
        });
        for (const analysis of analyses) {
            for (const result of analysis.results) {
                await this.repos.results.remove(result);
            }

            await this.repos.analyses.deleteAnalysis(analysis.id);
        }

        // Remove project folder
        const downloadPath = process.env['DOWNLOAD_PATH'] ?? '/private';
        const filePath = validateAndJoinPath(downloadPath, organization.id, 'projects', project.id);
        // Path is validated using validateAndJoinPath to prevent traversal attacks
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (existsSync(filePath)) {
            await rm(filePath, { recursive: true, force: true });
        }

        for (const file of project.files) {
            await this.repos.file.remove(file);
        }

        await this.repos.projects.deleteProject(id);

        await this.organizationLoggerService.addAuditLog(
            ActionType.ProjectDelete,
            `The User removed project ${project.url} from the organization.`,
            orgId,
            user.userId
        );
    }
}
