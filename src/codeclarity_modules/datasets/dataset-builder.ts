import {
  type GithubApiError,
  isRateLimitError,
  requestedRetryDelayMs,
} from "src/base_modules/integrations/github/githubRateLimit";
import {
  type GithubContentEntry,
  type GithubRepoMetadata,
  type GithubRestClient,
  type GithubSearchRepoItem,
  isActiveRepo,
  searchStarredRepos,
} from "src/base_modules/integrations/github/githubSearch";

import { type DatasetParams, type DatasetStats } from "./dataset.entity";

/** A repository qualifies if its root commits this file and one lockfile. */
export const REQUIRED_ROOT_FILE = "package.json";

/** The root lockfile names js-sbom accepts. */
export const DEFAULT_LOCKFILES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "npm-shrinkwrap.json",
];

/** The search API allows ~30 requests per minute. */
const SEARCH_PAGE_INTERVAL_MS = 2000;

/** Without a known reset time, try again after this long. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;

export interface BuiltEntry {
  rank: number;
  full_name: string;
  owner: string;
  repo: string;
  git_url: string;
  default_branch: string;
  stars: number;
  language: string | null;
  github_id: string;
  lockfiles: string[];
}

export interface BuildResult {
  entries: BuiltEntry[];
  stats: DatasetStats;
}

export interface BuildHooks {
  sleep: (ms: number) => Promise<void>;
  /** Called before every GitHub request (lease renewal, cancellation) */
  beforeRequest?: () => Promise<void>;
}

/** GitHub asked us to stop; the build can be retried at `retryAt` (epoch ms). */
export class GithubRateLimited extends Error {
  constructor(readonly retryAt: number) {
    super(
      `GitHub rate limit reached, retry after ${new Date(retryAt).toISOString()}`,
    );
    this.name = "GithubRateLimited";
  }
}

function rateLimitedAt(err: GithubApiError, now: number): GithubRateLimited {
  const delayMs = requestedRetryDelayMs(err.response?.headers ?? {}, now);
  return new GithubRateLimited(now + (delayMs || DEFAULT_RATE_LIMIT_WAIT_MS));
}

/** Code point order on the lower-cased name: stable across locales. */
function compareNames(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * Draw the top `limit` repositories by stars whose root commits package.json
 * and a lockfile: the most-starred pages per language are merged, deduped by
 * lower-cased owner/name and probed in star order until enough qualify.
 * @throws {GithubRateLimited} If GitHub rate limited a request for longer than the client retries
 */
export async function buildDataset(
  client: GithubRestClient,
  params: DatasetParams,
  hooks: BuildHooks,
): Promise<BuildResult> {
  const stats: DatasetStats = {
    search_results: 0,
    candidates: 0,
    probed: 0,
    selected: 0,
    rejected: {
      repo_gone: 0,
      duplicate_canonical: 0,
      fork_or_archived: 0,
      no_branch: 0,
      no_package_json: 0,
      no_lockfile: 0,
    },
  };

  const candidates = await gatherCandidates(client, params, hooks, stats);
  stats.candidates = candidates.length;

  const entries: BuiltEntry[] = [];
  const seenCanonical = new Set<string>();
  for (const item of candidates) {
    if (entries.length >= params.limit) break;
    stats.probed++;

    const owner = item.owner?.login ?? "";
    const meta = await getRepo(client, owner, item.name, hooks);
    if (!meta) {
      stats.rejected.repo_gone++;
      continue;
    }
    const canonical = meta.full_name || `${owner}/${item.name}`;
    if (seenCanonical.has(canonical.toLowerCase())) {
      stats.rejected.duplicate_canonical++;
      continue;
    }
    if (!isActiveRepo(meta)) {
      stats.rejected.fork_or_archived++;
      continue;
    }
    const branch = meta.default_branch;
    if (!branch) {
      stats.rejected.no_branch++;
      continue;
    }

    const rootFiles = await listRootFiles(
      client,
      owner,
      item.name,
      branch,
      hooks,
    );
    if (!rootFiles?.has(REQUIRED_ROOT_FILE)) {
      stats.rejected.no_package_json++;
      continue;
    }
    const lockfiles = params.lockfiles.filter((name) => rootFiles.has(name));
    if (lockfiles.length === 0) {
      stats.rejected.no_lockfile++;
      continue;
    }

    seenCanonical.add(canonical.toLowerCase());
    entries.push({
      rank: entries.length,
      full_name: canonical,
      owner: meta.owner?.login ?? owner,
      repo: meta.name || item.name,
      git_url: meta.html_url || `https://github.com/${owner}/${item.name}`,
      default_branch: branch,
      stars: item.stargazers_count ?? 0,
      language: item.language,
      github_id: String(meta.id),
      lockfiles,
    });
  }

  stats.selected = entries.length;
  return { entries, stats };
}

/** Search every language, keep active repos, dedupe and rank them. */
async function gatherCandidates(
  client: GithubRestClient,
  params: DatasetParams,
  hooks: BuildHooks,
  stats: DatasetStats,
): Promise<GithubSearchRepoItem[]> {
  const byName = new Map<string, GithubSearchRepoItem>();
  let firstRequest = true;

  for (const language of params.languages) {
    for (let page = 1; page <= params.pages; page++) {
      if (!firstRequest) await hooks.sleep(SEARCH_PAGE_INTERVAL_MS);
      firstRequest = false;

      const items = await searchPage(client, language, page, params, hooks);
      if (items.length === 0) break;
      stats.search_results += items.length;

      for (const item of items) {
        const owner = item.owner?.login;
        if (!owner || !item.name || !isActiveRepo(item)) continue;
        const key = `${owner.toLowerCase()}/${item.name.toLowerCase()}`;
        const previous = byName.get(key);
        if (
          !previous ||
          (item.stargazers_count ?? 0) > (previous.stargazers_count ?? 0)
        ) {
          byName.set(key, item);
        }
      }
    }
  }

  return [...byName.values()].sort(
    (a, b) =>
      (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0) ||
      compareNames(a.full_name, b.full_name),
  );
}

/** One search page; past the 1000-result window (422) counts as empty. */
async function searchPage(
  client: GithubRestClient,
  language: string,
  page: number,
  params: DatasetParams,
  hooks: BuildHooks,
): Promise<GithubSearchRepoItem[]> {
  await hooks.beforeRequest?.();
  try {
    const result = await searchStarredRepos(
      client,
      language,
      page,
      params.min_stars,
    );
    return result.items;
  } catch (err) {
    const apiError = err as GithubApiError;
    if (isRateLimitError(apiError)) throw rateLimitedAt(apiError, Date.now());
    if (apiError.status === 422) return [];
    throw err;
  }
}

/** Repository metadata, or null if it is gone or not accessible. */
async function getRepo(
  client: GithubRestClient,
  owner: string,
  repo: string,
  hooks: BuildHooks,
): Promise<GithubRepoMetadata | null> {
  await hooks.beforeRequest?.();
  try {
    const response = (await client.rest.repos.get({ owner, repo })) as {
      data: GithubRepoMetadata;
    };
    return response.data;
  } catch (err) {
    const apiError = err as GithubApiError;
    if (isRateLimitError(apiError)) throw rateLimitedAt(apiError, Date.now());
    if ([403, 404, 451].includes(apiError.status ?? 0)) return null;
    throw err;
  }
}

/** Names in the repository root at `ref`, or null if it can't be listed. */
async function listRootFiles(
  client: GithubRestClient,
  owner: string,
  repo: string,
  ref: string,
  hooks: BuildHooks,
): Promise<Set<string> | null> {
  await hooks.beforeRequest?.();
  try {
    const response = (await client.rest.repos.getContent({
      owner,
      repo,
      path: "",
      ref,
    })) as { data: GithubContentEntry[] | GithubContentEntry };
    if (!Array.isArray(response.data)) return null;
    return new Set(response.data.map((entry) => entry.name));
  } catch (err) {
    const apiError = err as GithubApiError;
    if (isRateLimitError(apiError)) throw rateLimitedAt(apiError, Date.now());
    if ([403, 404, 409, 451].includes(apiError.status ?? 0)) return null;
    throw err;
  }
}
