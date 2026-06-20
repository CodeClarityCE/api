import { Injectable } from "@nestjs/common";
import { existsSync } from "fs";
import { mkdir, rm } from "fs/promises";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { IntegrationProvider as IntegrationProviderEntity } from "src/base_modules/integrations/integrations.entity";
import { OrganizationLoggerService } from "src/base_modules/organizations/log/organizationLogger.service";
import { ActionType } from "src/base_modules/organizations/log/orgAuditLog.types";
import { MemberRole } from "src/base_modules/organizations/memberships/organization.memberships.entity";
import {
  IntegrationProvider,
  IntegrationType,
  Project,
} from "src/base_modules/projects/project.entity";
import {
  BatchItemResult,
  BatchResponse,
  ProjectImportBody,
} from "src/base_modules/projects/project.types";
import { RepositoryCache } from "src/base_modules/projects/repositoryCache.entity";
import { AnalysisResultsRepository } from "src/codeclarity_modules/results/results.repository";
import {
  EntityNotFound,
  IntegrationNotSupported,
  NotAuthorized,
} from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
  TypedPaginatedData,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";
import { validateAndJoinPath } from "src/utils/path-validator";

import { AnalysesRepository } from "../analyses/analyses.repository";
import { FileRepository } from "../file/file.repository";
import { GithubRepositoriesService } from "../integrations/github/githubRepos.service";
import { GitlabRepositoriesService } from "../integrations/gitlab/gitlabRepos.service";
import { IntegrationsRepository } from "../integrations/integrations.repository";
import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "../shared/repositories";

export enum AllowedOrderByGetProjects {
  IMPORTED_ON = "imported_on",
  NAME = "url",
}

/** Repository services grouped for dependency injection */
interface RepositoryServices {
  users: UsersRepository;
  organizations: OrganizationsRepository;
  memberships: MembershipsRepository;
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
    private readonly githubRepositoriesService: GithubRepositoriesService,
    private readonly gitlabRepositoriesService: GitlabRepositoriesService,
    usersRepository: UsersRepository,
    organizationsRepository: OrganizationsRepository,
    membershipsRepository: MembershipsRepository,
    fileRepository: FileRepository,
    integrationsRepository: IntegrationsRepository,
    resultsRepository: AnalysisResultsRepository,
    analysesRepository: AnalysesRepository,
    projectsRepository: ProjectsRepository,
  ) {
    this.repos = {
      users: usersRepository,
      organizations: organizationsRepository,
      memberships: membershipsRepository,
      file: fileRepository,
      integrations: integrationsRepository,
      results: resultsRepository,
      analyses: analysesRepository,
      projects: projectsRepository,
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
    originalError: Error,
  ): Promise<RepositoryCache> {
    const response = await fetch(url);
    if (!response.ok) {
      throw originalError;
    }
    const body = await response.text();
    if (body.includes("Page not found")) {
      throw originalError;
    }

    const repo = new RepositoryCache();
    repo.fully_qualified_name = url.replace(`https://${serviceDomain}/`, "");
    repo.description = "Imported manually";
    repo.default_branch = "main";
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
    user: AuthenticatedUser,
  ): Promise<string> {
    // (1) Check that the user is a member of the org
    await this.repos.memberships.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    // Idempotent import: a repo already imported by THIS user into THIS org
    // reuses the existing project. Scoped per-user so each user keeps their own
    // download folder. FILE imports (empty url) are never deduped. Done before
    // the expensive repo sync below so re-imports short-circuit cheaply.
    if (projectData.integration_id && projectData.url) {
      const existing = await this.repos.projects.getProjectByUrlOrgAndUser(
        projectData.url,
        orgId,
        user.userId,
      );
      if (existing) return existing.id;
    }

    const project = new Project();

    if (projectData.integration_id) {
      const integration =
        await this.repos.integrations.getIntegrationByIdAndOrganizationAndUser(
          projectData.integration_id,
          orgId,
          user.userId,
        );

      let repo: RepositoryCache;

      if (
        integration.integration_provider === IntegrationProviderEntity.GITHUB
      ) {
        await this.githubRepositoriesService.syncGithubRepos(
          projectData.integration_id,
        );
        try {
          repo = await this.githubRepositoriesService.getGithubRepository(
            orgId,
            projectData.integration_id,
            projectData.url,
            user,
          );
        } catch (err) {
          if (!(err instanceof EntityNotFound)) throw err;
          repo = await this.checkPublicRepositoryAccess(
            projectData.url,
            "github.com",
            err,
          );
        }
      } else if (
        integration.integration_provider === IntegrationProviderEntity.GITLAB
      ) {
        await this.gitlabRepositoriesService.syncGitlabRepos(
          projectData.integration_id,
        );
        try {
          repo = await this.gitlabRepositoriesService.getGitlabRepository(
            orgId,
            projectData.integration_id,
            projectData.url,
            user,
          );
        } catch (err) {
          if (!(err instanceof EntityNotFound)) throw err;
          repo = await this.checkPublicRepositoryAccess(
            projectData.url,
            "gitlab.com",
            err,
          );
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
      project.url = "";
      // project.integration = integration;
      project.default_branch = "";
      project.service_domain = "";
      project.integration_provider = IntegrationProvider.FILE;
    }

    const user_adding = await this.repos.users.getUserById(user.userId);

    const organization =
      await this.repos.organizations.getOrganizationById(orgId);

    project.downloaded = false;
    project.added_on = new Date();
    project.added_by = user_adding;
    project.organizations = [organization];
    project.integration_type = IntegrationType.VCS;
    project.invalid = false;

    const added_project = await this.repos.projects.saveProject(project);

    const downloadPath = process.env["DOWNLOAD_PATH"] ?? "/private";
    const folderPath = validateAndJoinPath(
      downloadPath,
      organization.id,
      "projects",
      added_project.id,
    );
    // Path is validated using validateAndJoinPath to prevent traversal attacks
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(folderPath, { recursive: true });

    await this.organizationLoggerService.addAuditLog(
      ActionType.ProjectCreate,
      `The User imported repository ${projectData.url} to the organization.`,
      orgId,
      user.userId,
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
  async get(
    organizationId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<Project> {
    // (1) Every member of an org can retrieve a project
    await this.repos.memberships.hasRequiredRole(
      organizationId,
      user.userId,
      MemberRole.USER,
    );

    // (2) Check if project belongs to org
    await this.repos.projects.doesProjectBelongToOrg(id, organizationId);

    return this.repos.projects.getProjectById(id, {
      files: true,
      added_by: true,
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
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<Project>> {
    // Every member of an org can retrieve all project
    await this.repos.memberships.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const paginationConfig: PaginationConfig = {
      maxEntriesPerPage: 100,
      defaultEntriesPerPage: 10,
    };

    let entriesPerPage = paginationConfig.defaultEntriesPerPage;
    let currentPage = 0;

    if (paginationUserSuppliedConf.entriesPerPage)
      entriesPerPage = Math.min(
        paginationConfig.maxEntriesPerPage,
        paginationUserSuppliedConf.entriesPerPage,
      );

    if (paginationUserSuppliedConf.currentPage)
      currentPage = Math.max(0, paginationUserSuppliedConf.currentPage);

    return this.repos.projects.getManyProjects(
      orgId,
      currentPage,
      entriesPerPage,
      searchKey,
    );
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
  async delete(
    orgId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    // (1) Check that member is at least a user
    await this.repos.memberships.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    // (2) Check if project belongs to org
    await this.repos.projects.doesProjectBelongToOrg(id, orgId);

    const membership = await this.repos.memberships.getMembershipRole(
      orgId,
      user.userId,
    );

    if (!membership) {
      throw new EntityNotFound();
    }

    const memberRole = membership.role;

    const project = await this.repos.projects.getProjectById(id, {
      files: true,
      added_by: true,
    });

    // Every moderator, admin or owner can remove a project.
    // a normal user can also delete it, iff he is the one that added the project
    if (memberRole === MemberRole.USER) {
      // Get edge and check if added_by === user.userId
      if (project.added_by?.id !== user.userId) {
        throw new NotAuthorized();
      }
    }

    const organization = await this.repos.organizations.getOrganizationById(
      orgId,
      {
        projects: true,
      },
    );
    organization.projects = organization.projects.filter((p) => p.id !== id);
    await this.repos.organizations.saveOrganization(organization);

    const analyses = await this.repos.analyses.getAnalysesByProjectId(
      project.id,
      {
        results: true,
      },
    );
    for (const analysis of analyses) {
      for (const result of analysis.results) {
        await this.repos.results.remove(result);
      }

      await this.repos.analyses.deleteAnalysis(analysis.id);
    }

    // Remove project folder
    const downloadPath = process.env["DOWNLOAD_PATH"] ?? "/private";
    const filePath = validateAndJoinPath(
      downloadPath,
      organization.id,
      "projects",
      project.id,
    );
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
      user.userId,
    );
  }

  /**
   * Bulk-delete projects of an org in bounded, throttled batches.
   *
   * Replaces the per-project, per-row cascade (which overloaded the API/DB when
   * run across many projects) with set-based bulk statements. In-flight analyses
   * are first transitioned to `cancelled` so workers stop advancing them, then
   * results, analyses, files and the projects themselves are removed per batch.
   * Each id gets an independent outcome so a single bad id never fails the call.
   *
   * @throws {NotAuthorized} if the caller is not at least a USER of the org
   * @param orgId The id of the org
   * @param projectIds The ids of the projects to delete
   * @param user The authenticated user
   * @returns A per-id result list plus succeeded/failed counts
   */
  async batchDelete(
    orgId: string,
    projectIds: string[],
    user: AuthenticatedUser,
  ): Promise<BatchResponse> {
    // (1) Authorize the caller once for the whole batch.
    await this.repos.memberships.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const membership = await this.repos.memberships.getMembershipRole(
      orgId,
      user.userId,
    );
    if (!membership) {
      throw new EntityNotFound();
    }
    const memberRole = membership.role;

    // De-duplicate the requested ids while preserving order.
    const uniqueIds = [...new Set(projectIds)];

    // (2) Resolve which ids actually belong to the org (and who added them).
    const owned = await this.repos.projects.getProjectsByIdsAndOrg(
      uniqueIds,
      orgId,
      { added_by: true },
    );
    const ownedById = new Map(owned.map((p) => [p.id, p]));

    const results: BatchItemResult[] = [];
    const deletableIds: string[] = [];

    for (const id of uniqueIds) {
      const project = ownedById.get(id);
      if (!project) {
        results.push({ id, status: "not_found" });
        continue;
      }
      // A normal USER may only delete projects they imported; moderators and
      // above may delete any project in the org.
      if (memberRole === MemberRole.USER && project.added_by?.id !== user.userId) {
        results.push({ id, status: "not_authorized" });
        continue;
      }
      deletableIds.push(id);
    }

    // (3) Delete the authorized projects in bounded, sequential batches so a
    // bulk clear can't starve the (pgbouncer-bounded) connection pool.
    const batchSize = Number(process.env["BULK_DELETE_BATCH_SIZE"] ?? 50);
    for (let i = 0; i < deletableIds.length; i += batchSize) {
      const batch = deletableIds.slice(i, i + batchSize);

      // Resolve the batch's analyses, cancel any in-flight ones (so workers
      // stop advancing them), then bulk-remove results -> analyses -> files ->
      // projects in FK-safe order.
      const analysisIds =
        await this.repos.analyses.getAnalysisIdsByProjectIds(batch);
      if (analysisIds.length > 0) {
        await this.repos.analyses.cancelByIds(analysisIds);
        await this.repos.results.deleteByAnalysisIds(analysisIds);
        await this.repos.analyses.deleteByIds(analysisIds);
      }
      await this.repos.file.deleteByProjectIds(batch);
      // The org<->project M2M junction FK has no ON DELETE CASCADE, so detach
      // the join rows (owning side) before removing the project rows.
      await this.repos.projects.detachFromOrganization(orgId, batch);
      await this.repos.projects.deleteByIds(batch);

      // Best-effort removal of each project's download folder (no DB load).
      const downloadPath = process.env["DOWNLOAD_PATH"] ?? "/private";
      for (const projectId of batch) {
        const filePath = validateAndJoinPath(
          downloadPath,
          orgId,
          "projects",
          projectId,
        );
        // Path is validated using validateAndJoinPath to prevent traversal attacks
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (existsSync(filePath)) {
          await rm(filePath, { recursive: true, force: true });
        }
        results.push({ id: projectId, status: "deleted" });
      }
    }

    // (4) One aggregated audit log instead of one per project.
    const deletedCount = deletableIds.length;
    if (deletedCount > 0) {
      await this.organizationLoggerService.addAuditLog(
        ActionType.ProjectDelete,
        `The User bulk-removed ${deletedCount} project(s) from the organization.`,
        orgId,
        user.userId,
      );
    }

    const failed = results.filter((r) => r.status !== "deleted").length;
    return { results, succeeded: deletedCount, failed };
  }
}
