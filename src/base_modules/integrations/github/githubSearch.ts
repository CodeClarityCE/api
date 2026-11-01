/** The subset of a GitHub search result item CodeClarity consumes. */
export interface GithubSearchRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner?: { login: string } | null;
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

/** The subset of GET /repos/{owner}/{repo} CodeClarity consumes. */
export interface GithubRepoMetadata {
  id: number;
  name: string;
  full_name: string;
  owner?: { login: string } | null;
  html_url: string;
  default_branch: string | null;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
}

/** One entry of a directory listing from GET /repos/{owner}/{repo}/contents/{path} */
export interface GithubContentEntry {
  name: string;
  type: string;
}

/**
 * The Octokit surface used here. Responses are cast to the interfaces above
 * because the dynamic import has limited type inference.
 */
export interface GithubRestClient {
  rest: {
    search: {
      repos(params: Record<string, unknown>): Promise<unknown>;
    };
    repos: {
      get(params: { owner: string; repo: string }): Promise<unknown>;
      getContent(params: {
        owner: string;
        repo: string;
        path: string;
        ref?: string;
      }): Promise<unknown>;
    };
  };
}

interface ThrottledRequestOptions {
  request: { retryCount: number };
}

export interface GithubClientOptions {
  /**
   * Retry a rate-limited request once, inside the call, only if GitHub asks
   * for at most this many seconds; longer waits surface as the 403/429 error.
   * Without it Octokit's default applies (one retry, however long the wait).
   */
  maxThrottleWaitSeconds?: number;
}

export async function createGithubClient(
  token: string,
  options: GithubClientOptions = {},
): Promise<GithubRestClient> {
  const octokit = await import("octokit");
  const { maxThrottleWaitSeconds } = options;
  const shouldRetry = (
    retryAfter: number,
    request: ThrottledRequestOptions,
  ): boolean =>
    maxThrottleWaitSeconds !== undefined &&
    retryAfter <= maxThrottleWaitSeconds &&
    request.request.retryCount === 0;

  return new octokit.Octokit({
    auth: token,
    ...(maxThrottleWaitSeconds === undefined
      ? {}
      : {
          throttle: {
            onRateLimit: shouldRetry,
            onSecondaryRateLimit: shouldRetry,
          },
        }),
  }) as unknown as GithubRestClient;
}

export interface GithubSearchPage {
  items: GithubSearchRepoItem[];
  incomplete: boolean;
}

/**
 * One page of the most-starred repositories of a language. One search per
 * language: multiple `language:` qualifiers cannot be OR-ed.
 */
export async function searchStarredRepos(
  client: GithubRestClient,
  language: string,
  page: number,
  minStars: number,
): Promise<GithubSearchPage> {
  const response = (await client.rest.search.repos({
    q: `stars:>${minStars} language:${language}`,
    sort: "stars",
    order: "desc",
    per_page: 100,
    page,
  })) as {
    data: { incomplete_results: boolean; items: GithubSearchRepoItem[] };
  };
  return {
    items: response.data.items,
    incomplete: response.data.incomplete_results === true,
  };
}

/** Forks, archived and disabled repositories are never offered for import. */
export function isActiveRepo(repo: {
  fork: boolean;
  archived: boolean;
  disabled: boolean;
}): boolean {
  return !repo.fork && !repo.archived && !repo.disabled;
}
