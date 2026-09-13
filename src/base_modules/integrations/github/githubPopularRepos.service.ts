import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
} from "src/base_modules/shared/repositories";
import { CodeClarityLogger, LogContext } from "src/services/logger.service";
import { TypedPaginatedResponse } from "src/types/apiResponses.types";
import {
  FailedToRetrieveReposFromProvider,
  IntegrationInvalidToken,
  NotAuthorized,
} from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";

import {
  CONST_POPULAR_REPOS_CACHE_TTL_MINUTES,
  CONST_POPULAR_REPOS_INCOMPLETE_TTL_MINUTES,
  CONST_POPULAR_REPOS_LIMIT,
  CONST_POPULAR_REPOS_MIN_REFRESH_MINUTES,
  CONST_POPULAR_REPOS_MIN_STARS,
} from "./constants";
import { GithubIntegrationService } from "./github.service";
import {
  POPULAR_GITHUB_LANGUAGES,
  PopularGithubLanguage,
  PopularGithubRepository,
} from "./githubPopular.types";

/** The subset of a GitHub search result item this service consumes. */
interface GithubSearchRepoItem {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
  visibility?: string;
  private?: boolean;
  description: string | null;
  created_at: string | null;
  stargazers_count: number;
  language: string | null;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
}

/** Response from Octokit search.repos */
interface OctokitSearchReposResponse {
  data: {
    total_count: number;
    incomplete_results: boolean;
    items: GithubSearchRepoItem[];
  };
}

/** GitHub API error with status code and (rate limit) response headers */
interface GithubApiError {
  status?: number;
  message?: string;
  response?: {
    headers?: Record<string, string | number | undefined>;
  };
}

/** An org-independent ranked repository (no imported flag yet). */
export interface RankedPopularRepo {
  id: string;
  url: string;
  default_branch: string;
  visibility: string;
  fully_qualified_name: string;
  description: string;
  created_at: Date;
  stargazers_count: number;
  language: string;
}

interface PopularCacheEntry {
  fetchedAt: number;
  ttlMs: number;
  repos: RankedPopularRepo[];
}

/** Sort keys accepted by the popular listing (superset of the cache listing's). */
enum AllowedOrderBy {
  STARS = "stars",
  FULLY_QUALIFIED_NAME = "fully_qualified_name",
  DESCRIPTION = "description",
  CREATED = "created_at",
  IMPORTED = "imported",
}

const MINUTE_MS = 60_000;

/**
 * Serves the "Popular on GitHub" import source: the most-starred public
 * repositories for the languages CodeClarity can analyse, fetched through the
 * organization's GitHub integration token, cached in memory per language and
 * flagged per organization with whether they were imported already.
 *
 * The ranking is org-independent, so one cache serves every organization; only
 * the `imported_already` flag is computed per request. The cache is per API
 * process: with several replicas each keeps its own copy, which bounds GitHub
 * search usage to a handful of calls per hour per replica.
 */
@Injectable()
export class GithubPopularReposService {
  private readonly logger = CodeClarityLogger.forService(
    "GithubPopularReposService",
  );
  private readonly cache = new Map<PopularGithubLanguage, PopularCacheEntry>();
  private readonly inFlight = new Map<
    PopularGithubLanguage,
    Promise<RankedPopularRepo[]>
  >();

  constructor(
    private readonly githubIntegrationService: GithubIntegrationService,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly projectsRepository: ProjectsRepository,
  ) {}

  /**
   * Get the most-starred repositories for the given languages, merged and
   * ranked by stars, paginated.
   * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
   * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to github
   * @throws {FailedToRetrieveReposFromProvider} If authentication to github succeeded, but the search failed (rate limit included)
   * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
   * @throws {IntegrationTokenExpired} In case the token is already expired
   * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
   * @param orgId The id of the organization
   * @param integrationId The id of the GitHub integration whose token is used
   * @param paginationUserSuppliedConf Pagination config
   * @param user The authenticated user
   * @param languages The primary languages to rank (empty means all supported)
   * @param searchKey An optional search key (matched against name and description)
   * @param forceRefresh Optional, asks GitHub again if the cached ranking is old enough
   * @param filters Optional, an array of filters (`only_non_imported` is honoured)
   * @param sortBy Optional sort key, defaults to stars
   * @param sortDirection Optional sort direction
   */
  async getPopularGithubRepositories(
    orgId: string,
    integrationId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
    languages: PopularGithubLanguage[],
    searchKey?: string,
    forceRefresh?: boolean,
    filters?: string[],
    sortBy?: string,
    sortDirection?: SortDirection,
  ): Promise<TypedPaginatedResponse<PopularGithubRepository>> {
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

    const logContext: LogContext = {
      organizationId: orgId,
      userId: user.userId,
      integrationId,
    };

    // The token is only needed when a language ranking must be (re)fetched;
    // resolving it validates it against GitHub, so do that at most once per
    // request and not at all when every ranking is served from the cache.
    let tokenPromise: Promise<string> | undefined;
    const getToken = (): Promise<string> => {
      tokenPromise ??= this.githubIntegrationService
        .getToken(integrationId)
        .then((token) => token.getToken());
      return tokenPromise;
    };

    const selectedLanguages =
      languages.length > 0 ? languages : [...POPULAR_GITHUB_LANGUAGES];
    const perLanguage = await Promise.all(
      selectedLanguages.map((language) =>
        this.getRankedForLanguage(
          language,
          getToken,
          forceRefresh === true,
          logContext,
        ),
      ),
    );
    const ranked = this.mergeAndRank(perLanguage);

    const importedUrls = await this.projectsRepository.getImportedUrlsInOrg(
      orgId,
      ranked.map((repo) => repo.url),
    );

    let repositories = ranked.map((repo) =>
      this.toDto(repo, integrationId, importedUrls.has(repo.url)),
    );

    if (filters?.includes("only_non_imported")) {
      repositories = repositories.filter((repo) => !repo.imported_already);
    }

    if (searchKey) {
      const needle = searchKey.toLowerCase();
      repositories = repositories.filter(
        (repo) =>
          repo.fully_qualified_name.toLowerCase().includes(needle) ||
          repo.description.toLowerCase().includes(needle),
      );
    }

    repositories = this.sortRepositories(repositories, sortBy, sortDirection);

    const fullCount = repositories.length;
    const pageData = repositories.slice(
      currentPage * entriesPerPage,
      (currentPage + 1) * entriesPerPage,
    );

    return {
      data: pageData,
      page: currentPage,
      entry_count: pageData.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: fullCount,
      filter_count: {},
    };
  }

  /**
   * The ranking for one language, from the cache when fresh, otherwise
   * refreshed from GitHub. Concurrent cold requests share one GitHub call.
   */
  private getRankedForLanguage(
    language: PopularGithubLanguage,
    getToken: () => Promise<string>,
    forceRefresh: boolean,
    logContext: LogContext,
  ): Promise<RankedPopularRepo[]> {
    const entry = this.cache.get(language);
    const age = entry ? Date.now() - entry.fetchedAt : Number.POSITIVE_INFINITY;
    const fresh = entry !== undefined && age < entry.ttlMs;
    const mayForce =
      forceRefresh && age > CONST_POPULAR_REPOS_MIN_REFRESH_MINUTES * MINUTE_MS;

    if (entry && fresh && !mayForce) {
      return Promise.resolve(entry.repos);
    }

    let pending = this.inFlight.get(language);
    if (!pending) {
      pending = this.refreshLanguage(
        language,
        getToken,
        entry,
        logContext,
      ).finally(() => {
        this.inFlight.delete(language);
      });
      this.inFlight.set(language, pending);
    }
    return pending;
  }

  /**
   * Ask GitHub for the ranking of one language and cache it. If GitHub fails
   * (rate limit, outage) and a previous ranking exists, serve that instead of
   * failing the whole page; token problems are never masked this way.
   */
  private async refreshLanguage(
    language: PopularGithubLanguage,
    getToken: () => Promise<string>,
    stale: PopularCacheEntry | undefined,
    logContext: LogContext,
  ): Promise<RankedPopularRepo[]> {
    try {
      const token = await getToken();
      const { repos, incomplete } = await this.fetchFromGithub(
        language,
        token,
        logContext,
      );
      const ttlMinutes = incomplete
        ? CONST_POPULAR_REPOS_INCOMPLETE_TTL_MINUTES
        : CONST_POPULAR_REPOS_CACHE_TTL_MINUTES;
      this.cache.set(language, {
        fetchedAt: Date.now(),
        ttlMs: ttlMinutes * MINUTE_MS,
        repos,
      });
      this.logger.log("Refreshed popular GitHub repositories", {
        ...logContext,
        language,
        count: repos.length,
        incomplete,
      });
      return repos;
    } catch (err) {
      if (stale && err instanceof FailedToRetrieveReposFromProvider) {
        this.logger.warn(
          "Serving stale popular GitHub repositories after a failed refresh",
          { ...logContext, language, cacheAgeMs: Date.now() - stale.fetchedAt },
        );
        return stale.repos;
      }
      throw err;
    }
  }

  /**
   * One GitHub search per language (multiple `language:` qualifiers cannot be
   * OR-ed). Only the first page is needed: 100 results per language, merged
   * and truncated to the overall limit afterwards.
   * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to github
   * @throws {FailedToRetrieveReposFromProvider} If authentication succeeded, but the search failed
   */
  private async fetchFromGithub(
    language: PopularGithubLanguage,
    token: string,
    logContext: LogContext,
  ): Promise<{ repos: RankedPopularRepo[]; incomplete: boolean }> {
    try {
      // Dynamic import has limited type inference - types are validated via OctokitSearchReposResponse cast
      const octokit = await import("octokit");

      const client = new octokit.Octokit({
        auth: token,
      });

      const response = (await client.rest.search.repos({
        q: `stars:>${CONST_POPULAR_REPOS_MIN_STARS} language:${language}`,
        sort: "stars",
        order: "desc",
        per_page: 100,
        page: 1,
      })) as unknown as OctokitSearchReposResponse;

      const repos = response.data.items
        .filter((item) => !item.fork && !item.archived && !item.disabled)
        .map((item) => this.toRanked(item, language));

      return { repos, incomplete: response.data.incomplete_results === true };
    } catch (err) {
      throw this.mapGithubError(err, language, logContext);
    }
  }

  private mapGithubError(
    err: unknown,
    language: PopularGithubLanguage,
    logContext: LogContext,
  ): unknown {
    const apiError = err as GithubApiError;
    if (apiError.status === undefined) return err;
    if (apiError.status === 401) return new IntegrationInvalidToken();

    const headers = apiError.response?.headers ?? {};
    if (apiError.status === 403 || apiError.status === 429) {
      this.logger.warn("GitHub search rate limited", {
        ...logContext,
        language,
        status: apiError.status,
        rateLimitRemaining: headers["x-ratelimit-remaining"],
        rateLimitReset: headers["x-ratelimit-reset"],
        retryAfter: headers["retry-after"],
      });
    } else {
      this.logger.warn("GitHub search failed", {
        ...logContext,
        language,
        status: apiError.status,
        message: apiError.message,
      });
    }
    return new FailedToRetrieveReposFromProvider();
  }

  private toRanked(
    item: GithubSearchRepoItem,
    language: PopularGithubLanguage,
  ): RankedPopularRepo {
    return {
      id: String(item.id),
      url: item.html_url,
      default_branch: item.default_branch,
      visibility: item.visibility ?? (item.private ? "private" : "public"),
      fully_qualified_name: item.full_name,
      description: item.description ?? "",
      created_at: item.created_at ? new Date(item.created_at) : new Date(),
      stargazers_count: item.stargazers_count ?? 0,
      language: item.language ?? language,
    };
  }

  /** Merge per-language rankings, dedupe by id, rank by stars, truncate. */
  private mergeAndRank(lists: RankedPopularRepo[][]): RankedPopularRepo[] {
    const byId = new Map<string, RankedPopularRepo>();
    for (const list of lists) {
      for (const repo of list) {
        const previous = byId.get(repo.id);
        if (!previous || repo.stargazers_count > previous.stargazers_count) {
          byId.set(repo.id, repo);
        }
      }
    }
    return [...byId.values()]
      .sort(
        (a, b) =>
          b.stargazers_count - a.stargazers_count ||
          a.fully_qualified_name.localeCompare(b.fully_qualified_name),
      )
      .slice(0, CONST_POPULAR_REPOS_LIMIT);
  }

  private toDto(
    repo: RankedPopularRepo,
    integrationId: string,
    importedAlready: boolean,
  ): PopularGithubRepository {
    const dto = new PopularGithubRepository();
    dto.id = repo.id;
    dto.url = repo.url;
    dto.default_branch = repo.default_branch;
    dto.visibility = repo.visibility;
    dto.fully_qualified_name = repo.fully_qualified_name;
    dto.description = repo.description;
    dto.created_at = repo.created_at;
    dto.imported_already = importedAlready;
    dto.integration_id = integrationId;
    dto.stargazers_count = repo.stargazers_count;
    dto.language = repo.language;
    return dto;
  }

  /**
   * Sort a page's worth of candidates. Stars default to descending (the
   * ranking), every other key to ascending like the cache listing; unknown
   * keys keep the star ranking. Ties fall back to the qualified name.
   */
  private sortRepositories(
    repositories: PopularGithubRepository[],
    sortBy?: string,
    sortDirection?: SortDirection,
  ): PopularGithubRepository[] {
    const key = (sortBy as AllowedOrderBy | undefined) ?? AllowedOrderBy.STARS;

    const comparators: Record<
      AllowedOrderBy,
      (a: PopularGithubRepository, b: PopularGithubRepository) => number
    > = {
      [AllowedOrderBy.STARS]: (a, b) => a.stargazers_count - b.stargazers_count,
      [AllowedOrderBy.FULLY_QUALIFIED_NAME]: (a, b) =>
        a.fully_qualified_name.localeCompare(b.fully_qualified_name),
      [AllowedOrderBy.DESCRIPTION]: (a, b) =>
        a.description.localeCompare(b.description),
      [AllowedOrderBy.CREATED]: (a, b) =>
        a.created_at.getTime() - b.created_at.getTime(),
      [AllowedOrderBy.IMPORTED]: (a, b) =>
        Number(a.imported_already) - Number(b.imported_already),
    };

    const compare = comparators[key];
    if (!compare) return repositories;

    const defaultDirection =
      key === AllowedOrderBy.STARS ? SortDirection.DESC : SortDirection.ASC;
    const direction =
      (sortDirection ?? defaultDirection) === SortDirection.ASC ? 1 : -1;

    return [...repositories].sort((a, b) => {
      const result = compare(a, b) * direction;
      return result !== 0
        ? result
        : a.fully_qualified_name.localeCompare(b.fully_qualified_name);
    });
  }
}
