import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import ms from "ms";
import { Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { GithubRepositorySchema } from "src/base_modules/integrations/github/github.types";
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
import {
  EntityNotFound,
  FailedToRetrieveReposFromProvider,
  IntegrationInvalidToken,
  NotAuthorized,
} from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";

import { CONST_VCS_INTEGRATION_CACHE_INVALIDATION_MINUTES } from "./constants";
import { GithubIntegrationService } from "./github.service";

/** GitHub API error with status code */
interface GithubApiError {
  status?: number;
  message?: string;
}

/** Response from Octokit repos.listForAuthenticatedUser */
interface OctokitReposResponse {
  headers: {
    link?: string;
  };
  data: GithubRepositorySchema[];
}

/** Owner and repository name parsed from a github.com repository url. */
export interface GithubRepoRef {
  owner: string;
  repo: string;
}

/**
 * Parse `https://github.com/{owner}/{repo}[.git][/...]` into owner and name.
 * @throws {EntityNotFound} when the url is not a github.com repository url
 */
export function parseGithubRepoUrl(url: string): GithubRepoRef {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EntityNotFound();
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new EntityNotFound();
  }
  const [owner, rawRepo] = parsed.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  const repo = rawRepo?.replace(/\.git$/, "");
  if (!owner || !repo) throw new EntityNotFound();
  return { owner, repo };
}

/** The subset of an Octokit repos.get response this service consumes. */
interface OctokitRepoResponse {
  data: {
    html_url: string;
    full_name: string;
    default_branch: string;
    visibility?: string;
    description: string | null;
    created_at: string | null;
  };
}

@Injectable()
export class GithubRepositoriesService {
  /** In-flight force syncs keyed by integration id (see forceSyncGithubRepos). */
  private readonly syncInFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly githubIntegrationService: GithubIntegrationService,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly integrationsRepository: IntegrationsRepository,
    @InjectRepository(RepositoryCache, "codeclarity")
    private repositoryCacheRepository: Repository<RepositoryCache>,
  ) {}

  /**
   * Check if github repos have been synced
   *
   * @param integrationId The id of the integration
   * @returns a boolean indicating whether the repos of the integration are synced
   */
  async areGithubReposSynced(integrationId: string): Promise<boolean> {
    const integration =
      await this.integrationsRepository.getIntegrationById(integrationId);

    const lastUpdated: Date | undefined = integration.last_repository_sync;

    if (!lastUpdated) return false;

    const invalidatedDate = new Date(
      ms(`-${CONST_VCS_INTEGRATION_CACHE_INVALIDATION_MINUTES}m`),
    );
    if (lastUpdated <= invalidatedDate) {
      return false;
    }

    return true;
  }

  /**
   * Get github repositories from the integration id
   * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
   * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to github
   * @throws {FailedToRetrieveReposFromProvider} If authentication to github succeeded, but a different error with the request was encountered
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param orgId The id of the organization
   * @param integrationId The id of the integration
   * @param paginationUserSuppliedConf Pagination config
   * @param user The authenticated user
   * @param searchKey An optional search key
   * @param forceRefresh Optional, if set forces a re-sync with github
   * @param filters Optional, an array of filters
   * @returns
   */
  async getGithubRepositories(
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

    // If the user specifically request to re-sync the repos (for example in case a newly create repo does not show up)
    if (forceRefresh !== undefined && forceRefresh === true) {
      await this.forceSyncGithubRepos(integrationId);
    } else {
      // Check if the github repo cache is synced
      const isSynced = await this.areGithubReposSynced(integrationId);

      // In case the cache is older than 10 minutes, since we last re-synced
      // or it was never synced, then re-sync
      if (!isSynced) {
        await this.forceSyncGithubRepos(integrationId);
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
   * Resolve a repository to import: from the integration's repository cache
   * when it is there, otherwise through the GitHub API (typically a public
   * repository the token owner does not own). The cache is not synced first:
   * the API lookup is authoritative for anything the cache does not hold.
   * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
   * @throws {EntityNotFound} If the url is not a github.com repository url or the repository does not exist / is not accessible
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to github
   * @throws {FailedToRetrieveReposFromProvider} If github answered with any other error
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param orgId The id of the organization
   * @param integrationId The id of the integration
   * @param url The url of the repository (https://github.com/owner/repo)
   * @param user The authenticated user
   */
  async resolveGithubRepository(
    orgId: string,
    integrationId: string,
    url: string,
    user: AuthenticatedUser,
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

    const cached = await this.repositoryCacheRepository.findOne({
      relations: { integration: true },
      where: { url, integration: { id: integrationId } },
    });

    return cached ?? (await this.getGithubRepositoryRemote(integrationId, url));
  }

  /**
   * Resolve a repository that is not in the integration's repository cache
   * (typically a public repository the token owner does not own) through the
   * GitHub API, so the default branch and metadata are accurate rather than
   * guessed. The result is transient and is NOT persisted to the cache.
   * @throws {EntityNotFound} If the url is not a github.com repository url or the repository does not exist / is not accessible
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to github
   * @throws {FailedToRetrieveReposFromProvider} If github answered with any other error
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param integrationId The id of the integration whose token is used
   * @param url The url of the repository (https://github.com/owner/repo)
   */
  async getGithubRepositoryRemote(
    integrationId: string,
    url: string,
  ): Promise<RepositoryCache> {
    const { owner, repo } = parseGithubRepoUrl(url);

    const githubToken =
      await this.githubIntegrationService.getToken(integrationId);
    const rawToken = githubToken.getToken();

    try {
      const octokit = await import("octokit");
      const client = new octokit.Octokit({ auth: rawToken });
      const response = (await client.rest.repos.get({
        owner,
        repo,
      })) as unknown as OctokitRepoResponse;
      const data = response.data;

      const repository = new RepositoryCache();
      repository.repository_type = RepositoryType.GITHUB;
      repository.url = data.html_url;
      repository.default_branch = data.default_branch;
      repository.visibility = data.visibility ?? "public";
      repository.fully_qualified_name = data.full_name;
      repository.description = data.description ?? "";
      repository.created_at = data.created_at
        ? new Date(data.created_at)
        : new Date();
      repository.service_domain = "github.com";
      return repository;
    } catch (err) {
      const apiError = err as GithubApiError;
      if (apiError.status === 404) throw new EntityNotFound();
      if (apiError.status === 401) throw new IntegrationInvalidToken();
      if (apiError.status) throw new FailedToRetrieveReposFromProvider();
      throw err;
    }
  }

  /**
   * Force sync, coalescing concurrent callers for the same integration into a
   * single GitHub round trip: parallel imports on a stale cache would
   * otherwise each run a full sync and each insert the same cache rows.
   */
  private forceSyncGithubRepos(integrationId: string): Promise<void> {
    let pending = this.syncInFlight.get(integrationId);
    if (!pending) {
      pending = this.doForceSyncGithubRepos(integrationId).finally(() => {
        this.syncInFlight.delete(integrationId);
      });
      this.syncInFlight.set(integrationId, pending);
    }
    return pending;
  }

  /**
   * Force Sync updated and new repos from the integration
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
   * @param user The authenticated user
   * @returns
   */
  private async doForceSyncGithubRepos(integrationId: string): Promise<void> {
    // Retrieve the access token to access gitlab from the integration
    const githubToken =
      await this.githubIntegrationService.getToken(integrationId);
    const rawToken = githubToken.getToken();

    const integration =
      await this.integrationsRepository.getIntegrationById(integrationId);

    const entriesPerPage = 100;

    // Fetch 1st page
    const [_repos, lastPage] = await this.githubApiFetchPage(
      1,
      entriesPerPage,
      integration.last_repository_sync,
      rawToken,
    );
    await this.saveRepos(_repos, integration.id);

    // Fetch the remaining pages
    if (lastPage > 1) {
      for (let i = 2; i <= lastPage; i++) {
        const [_repos] = await this.githubApiFetchPage(
          i,
          entriesPerPage,
          integration.last_repository_sync,
          rawToken,
        );
        await this.saveRepos(_repos, integration.id);
      }
    }

    integration.last_repository_sync = new Date();
    await this.integrationsRepository.saveIntegration(integration);
  }

  /**
   * Save or update the repositories
   * @param db A results databse instance
   * @param repos An array of github repositories
   * @param transaction A db transaction instance
   */
  private async saveRepos(
    repos: GithubRepositorySchema[],
    integrationId: string,
  ): Promise<void> {
    const integration =
      await this.integrationsRepository.getIntegrationById(integrationId);
    for (const rawRepo of repos) {
      const repository = new RepositoryCache();
      repository.repository_type = RepositoryType.GITHUB;
      repository.url = rawRepo.html_url;
      repository.default_branch = rawRepo.default_branch;
      repository.visibility = rawRepo.visibility ?? "public";
      repository.fully_qualified_name = rawRepo.full_name;
      repository.description = rawRepo.description ?? "";
      repository.created_at = rawRepo.created_at ?? new Date();
      repository.integration = integration;

      await this.repositoryCacheRepository.save(repository);
    }
  }

  /**
   * Fetches a page of repos from the github api
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
   * @throws {FailedToRetrieveReposFromProvider} If authentication to github succeeded, but a different error with the request was encountered
   * @param page The page to fetch
   * @param entriesPerPage Entries per page (must stay the same in one transaction)
   * @param lastUpdated The date time on which the repos where last update
   * @param token The github api token
   * @returns
   */
  private async githubApiFetchPage(
    page: number,
    entriesPerPage: number,
    lastUpdated: Date | undefined,
    token: string,
  ): Promise<[GithubRepositorySchema[], number]> {
    try {
      // Dynamic import has limited type inference - types are validated via OctokitReposResponse cast
      const octokit = await import("octokit");

      const client = new octokit.Octokit({
        auth: token,
      });

      const response = (await client.rest.repos.listForAuthenticatedUser({
        per_page: entriesPerPage,
        page: page,
        sort: "updated",
        since: lastUpdated ? lastUpdated.toISOString() : undefined,
      })) as OctokitReposResponse;

      const linkHeader = response.headers.link;

      let lastPage = 1;

      // Just why github, just why...
      if (linkHeader) {
        const links = linkHeader.split(",");
        const lastLinkEntry = links.find((link: string) =>
          link.includes('rel="last"'),
        );
        if (lastLinkEntry) {
          const cleanedLink = lastLinkEntry
            .replace('; rel="last"', "")
            .replace("<", "")
            .replace(">", "")
            .trim();
          const urlParams = new URLSearchParams(cleanedLink);
          const lastPageQuery = urlParams.get("page");
          if (lastPageQuery) {
            lastPage = parseInt(lastPageQuery);
          }
        }
      }

      return [response.data, lastPage];
    } catch (err) {
      const apiError = err as GithubApiError;
      if (apiError.status) {
        if (apiError.status === 401) {
          throw new IntegrationInvalidToken();
        } else {
          throw new FailedToRetrieveReposFromProvider();
        }
      }
      throw err;
    }
  }
}
