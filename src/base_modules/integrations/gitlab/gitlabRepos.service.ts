import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import ms from "ms";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  RepositoryCache,
  RepositoryType,
} from "src/base_modules/projects/repositoryCache.entity";
import {
  IntegrationsRepository,
  MembershipsRepository,
  OrganizationsRepository,
} from "src/base_modules/shared/repositories";
import { TypedPaginatedResponse } from "src/types/apiResponses.types";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";
import { Repository } from "typeorm";
import { CONST_VCS_INTEGRATION_CACHE_INVALIDATION_MINUTES } from "../github/constants";
import { GitlabIntegrationService } from "./gitlab.service";

/** GitLab API project response structure */
interface GitLabProject {
  name_with_namespace: string;
  http_url_to_repo: string;
  default_branch: string;
  visibility?: string;
  description?: string;
  created_at?: string;
}

@Injectable()
export class GitlabRepositoriesService {
  constructor(
    private readonly gitlabIntegrationService: GitlabIntegrationService,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly integrationsRepository: IntegrationsRepository,
    @InjectRepository(RepositoryCache, "codeclarity")
    private repositoryCacheRepository: Repository<RepositoryCache>,
  ) {}

  /**
   * Sync updated and new repos from the integration
   * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
   * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
   * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
   * @throws {IntegrationWrongTokenType} In case the token type is not supported
   * @param integrationId The id of the integration
   * @returns
   */
  async syncGitlabRepos(integrationId: string): Promise<void> {
    // Retrieve the access token to access gitlab from the integration
    const gitlabToken =
      await this.gitlabIntegrationService.getToken(integrationId);
    const rawToken = gitlabToken.getToken();

    const integration =
      await this.integrationsRepository.getIntegrationById(integrationId);

    const entriesPerPage = 100;

    try {
      const response = await fetch(
        `${
          integration.service_domain
        }/api/v4/projects?owned=true&membership=true&per_page=${entriesPerPage}`,
        {
          headers: {
            "PRIVATE-TOKEN": rawToken,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch repositories from GitLab. Status: ${response.status}`,
        );
      }

      const projects = (await response.json()) as GitLabProject[];

      // Process the projects and save them to the repository cache
      for (const project of projects) {
        const repo = await this.repositoryCacheRepository.existsBy({
          fully_qualified_name: project.name_with_namespace,
        });
        if (repo) continue;

        const repository = new RepositoryCache();
        repository.repository_type = RepositoryType.GITLAB;
        repository.url = project.http_url_to_repo;
        repository.default_branch = project.default_branch;
        repository.visibility = project.visibility ?? "public";
        repository.fully_qualified_name = project.name_with_namespace;
        repository.description = project.description ?? "";
        repository.created_at = project.created_at
          ? new Date(project.created_at)
          : new Date();
        repository.integration = integration;

        await this.repositoryCacheRepository.save(repository);
      }
    } catch (error) {
      console.error("Error syncing GitLab repositories:", error);
      throw error;
    }

    // TODO Fetch repositories

    integration.last_repository_sync = new Date();
    await this.integrationsRepository.saveIntegration(integration);
  }

  /**
   * Get gitlab repositories from the integration id
   * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
   * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
   * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param orgId The id of the organization
   * @param integrationId The id of the integration
   * @param paginationUserSuppliedConf Pagination config
   * @param user The authenticated user
   * @param searchKey An optional search key
   * @param forceRefresh Optional, if set forces a re-sync with gitlab
   * @param filters Optional, an array of filters
   * @returns
   */
  async getGitlabRepositories(
    orgId: string,
    integrationId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
    searchKey?: string,
    forceRefresh?: boolean,
    filters?: string[],
    sortBy?: string,
    sortDirection?: SortDirection,
  ): Promise<TypedPaginatedResponse<RepositoryCache>> {
    enum AllowedOrderBy {
      FULLY_QUALIFIED_NAME = "fully_qualified_name",
      DESCRIPTION = "description",
      CREATED = "created_at",
      IMPORTED = "imported",
    }

    // Type-safe comparison by casting sortBy to AllowedOrderBy
    const typedSortBy = sortBy as AllowedOrderBy | undefined;

    // (1) Check that the user has the right to access the org
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    // (2) Check that the integration belongs to the org
    if (
      !(await this.organizationsRepository.doesIntegrationBelongToOrg(
        integrationId,
        orgId,
      ))
    ) {
      throw new NotAuthorized();
    }

    const paginationConfig: PaginationConfig = {
      maxEntriesPerPage: 100,
      defaultEntriesPerPage: 20,
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

    const isSynced = await this.areGitlabReposSynced(integrationId);

    if (forceRefresh !== undefined && forceRefresh === true) {
      await this.syncGitlabRepos(integrationId);
    } else {
      if (!isSynced) {
        await this.syncGitlabRepos(integrationId);
      }
    }

    let repositoryQB = this.repositoryCacheRepository
      .createQueryBuilder("repo")
      .where("repo.integration = :integrationId", { integrationId });

    if (typedSortBy) {
      if (typedSortBy === AllowedOrderBy.FULLY_QUALIFIED_NAME)
        repositoryQB = repositoryQB.orderBy(
          "fully_qualified_name",
          sortDirection ?? "ASC",
        );
      else if (typedSortBy === AllowedOrderBy.DESCRIPTION)
        repositoryQB = repositoryQB.orderBy(
          "description",
          sortDirection ?? "ASC",
        );
      else if (typedSortBy === AllowedOrderBy.CREATED)
        repositoryQB = repositoryQB.orderBy(
          "created_at",
          sortDirection ?? "ASC",
        );
      else if (typedSortBy === AllowedOrderBy.IMPORTED)
        repositoryQB = repositoryQB.orderBy(
          "imported_already",
          sortDirection ?? "ASC",
        );
    }

    if (searchKey) {
      repositoryQB = repositoryQB.andWhere(
        "repo.fully_qualified_name LIKE :searchValue",
        {
          searchValue: `%${searchKey}%`,
        },
      );
    }

    if (filters) {
      // if (filters.includes('only_non_imported')) {
      //     repositoryQB = repositoryQB.andWhere('repo.imported_already = :imported', {
      //         imported: false
      //     });
      // }
    }

    const fullCount = await repositoryQB.getCount();

    repositoryQB = repositoryQB
      .skip(currentPage * entriesPerPage)
      .take(entriesPerPage);

    const repositories = await repositoryQB.getMany();

    // Return the paginated list of github repos for the integration
    return {
      data: repositories,
      page: currentPage,
      entry_count: repositories.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: fullCount, // once you apply filters this needs to change
      filter_count: {},
    };
  }

  /**
   * Check if github repos have been synced
   *
   * @param integrationId The id of the integration
   * @returns a boolean indicating whether the repos of the integration are synced
   */
  async areGitlabReposSynced(integrationId: string): Promise<boolean> {
    const integration =
      await this.integrationsRepository.getIntegrationById(integrationId);

    const lastUpdated: Date | undefined = integration.last_repository_sync;

    if (!lastUpdated) return false;

    const invalidatedDate = new Date(
      Date.now() + ms(`-${CONST_VCS_INTEGRATION_CACHE_INVALIDATION_MINUTES}m`),
    );
    if (lastUpdated <= invalidatedDate) {
      return false;
    }

    return true;
  }

  /**
   * Get a specific gitlab repository from the integration id
   * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
   * @throws {EntityNotFound} In case the repo could not be found or the integration could not be found or the integration is of the wrong type
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
   * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
   * @param orgId The id of the organization
   * @param integrationId The id of the integration
   * @param url The url of the repository (https://gitlab.com/user/repo)
   * @param user The authenticated user
   * @param forceRefresh Optional, if set forces a re-sync with gitlab
   * @returns
   */
  async getGitlabRepository(
    orgId: string,
    integrationId: string,
    url: string,
    user: AuthenticatedUser,
    forceRefresh?: boolean,
  ): Promise<RepositoryCache> {
    // (1) Check that the user has the right to access the org
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    // (2) Check that the integration belongs to the org
    if (
      !(await this.organizationsRepository.doesIntegrationBelongToOrg(
        integrationId,
        orgId,
      ))
    ) {
      throw new NotAuthorized();
    }

    const isSynced = await this.areGitlabReposSynced(integrationId);

    if (forceRefresh !== undefined && forceRefresh === true) {
      await this.syncGitlabRepos(integrationId);
    } else {
      if (!isSynced) {
        await this.syncGitlabRepos(integrationId);
      }
    }

    const repo = await this.repositoryCacheRepository.findOne({
      relations: ["integration"],
      where: {
        url: url,
        integration: {
          id: integrationId,
        },
      },
    });

    if (!repo) {
      throw new EntityNotFound();
    }

    return repo;
  }
}
