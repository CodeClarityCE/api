import { type GithubRestClient } from "src/base_modules/integrations/github/githubSearch";

import { DatasetLanguage, type DatasetParams } from "./dataset.entity";
import {
  buildDataset,
  type BuildHooks,
  DEFAULT_LOCKFILES,
  GithubRateLimited,
} from "./dataset-builder";

interface FakeRepo {
  owner: string;
  name: string;
  stars: number;
  language?: string;
  fork?: boolean;
  archived?: boolean;
  /** Overrides of GET /repos (canonical name after a rename, flags, ...) */
  meta?: Record<string, unknown> | "gone";
  /** Root file names; undefined means the listing 404s */
  root?: string[];
}

function searchItem(repo: FakeRepo): Record<string, unknown> {
  return {
    id: repo.stars,
    name: repo.name,
    full_name: `${repo.owner}/${repo.name}`,
    owner: { login: repo.owner },
    html_url: `https://github.com/${repo.owner}/${repo.name}`,
    default_branch: "main",
    description: null,
    created_at: null,
    stargazers_count: repo.stars,
    language: repo.language ?? "JavaScript",
    fork: repo.fork ?? false,
    archived: repo.archived ?? false,
    disabled: false,
  };
}

function httpError(status: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    response: { headers },
  });
}

/**
 * A fake GitHub: `pages[language]` is the list of search pages for that
 * language; repos are looked up by "owner/name" for GET /repos and contents.
 */
function fakeClient(
  pages: Record<string, FakeRepo[][]>,
  overrides: Partial<{
    search: jest.Mock;
    get: jest.Mock;
    getContent: jest.Mock;
  }> = {},
): {
  client: GithubRestClient;
  search: jest.Mock;
  get: jest.Mock;
  getContent: jest.Mock;
} {
  const all = new Map<string, FakeRepo>();
  for (const list of Object.values(pages)) {
    for (const page of list) {
      for (const repo of page) all.set(`${repo.owner}/${repo.name}`, repo);
    }
  }

  const search =
    overrides.search ??
    jest.fn(({ q, page }: { q: string; page: number }) => {
      const language = /language:(\w+)/.exec(q)?.[1] ?? "";
      const items = (pages[language]?.[page - 1] ?? []).map(searchItem);
      return Promise.resolve({ data: { incomplete_results: false, items } });
    });

  const get =
    overrides.get ??
    jest.fn(({ owner, repo }: { owner: string; repo: string }) => {
      const fake = all.get(`${owner}/${repo}`);
      if (!fake || fake.meta === "gone") return Promise.reject(httpError(404));
      return Promise.resolve({
        data: {
          id: fake.stars,
          name: fake.name,
          full_name: `${fake.owner}/${fake.name}`,
          owner: { login: fake.owner },
          html_url: `https://github.com/${fake.owner}/${fake.name}`,
          default_branch: "main",
          fork: fake.fork ?? false,
          archived: fake.archived ?? false,
          disabled: false,
          ...fake.meta,
        },
      });
    });

  const getContent =
    overrides.getContent ??
    jest.fn(({ owner, repo }: { owner: string; repo: string }) => {
      const fake = all.get(`${owner}/${repo}`);
      if (!fake?.root) return Promise.reject(httpError(404));
      return Promise.resolve({
        data: fake.root.map((name) => ({ name, type: "file" })),
      });
    });

  return {
    client: { rest: { search: { repos: search }, repos: { get, getContent } } },
    search,
    get,
    getContent,
  };
}

const NODE_ROOT = ["package.json", "yarn.lock", "README.md"];

function params(overrides: Partial<DatasetParams> = {}): DatasetParams {
  return {
    languages: [DatasetLanguage.JAVASCRIPT],
    pages: 3,
    min_stars: 1000,
    limit: 100,
    lockfiles: DEFAULT_LOCKFILES,
    ...overrides,
  };
}

function hooks(): BuildHooks & { sleep: jest.Mock } {
  return { sleep: jest.fn().mockResolvedValue(undefined) };
}

describe("buildDataset", () => {
  it("ranks qualifying repositories by stars across languages", async () => {
    const { client } = fakeClient({
      JavaScript: [
        [
          { owner: "a", name: "js-big", stars: 900, root: NODE_ROOT },
          { owner: "a", name: "js-small", stars: 100, root: NODE_ROOT },
        ],
      ],
      TypeScript: [
        [
          {
            owner: "b",
            name: "ts-mid",
            stars: 500,
            language: "TypeScript",
            root: ["package.json", "pnpm-lock.yaml"],
          },
        ],
      ],
    });

    const { entries, stats } = await buildDataset(
      client,
      params({
        languages: [DatasetLanguage.JAVASCRIPT, DatasetLanguage.TYPESCRIPT],
      }),
      hooks(),
    );

    expect(entries.map((e) => [e.rank, e.full_name, e.stars])).toEqual([
      [0, "a/js-big", 900],
      [1, "b/ts-mid", 500],
      [2, "a/js-small", 100],
    ]);
    expect(entries[1]).toMatchObject({
      owner: "b",
      repo: "ts-mid",
      git_url: "https://github.com/b/ts-mid",
      default_branch: "main",
      language: "TypeScript",
      github_id: "500",
      lockfiles: ["pnpm-lock.yaml"],
    });
    expect(stats).toMatchObject({
      search_results: 3,
      candidates: 3,
      probed: 3,
      selected: 3,
    });
  });

  it("searches with the star threshold and stops at the first empty page", async () => {
    const repo = { owner: "a", name: "x", stars: 5000, root: NODE_ROOT };
    const { client, search } = fakeClient({ JavaScript: [[repo], []] });
    const h = hooks();

    await buildDataset(client, params({ pages: 3, min_stars: 2000 }), h);

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledWith({
      q: "stars:>2000 language:JavaScript",
      sort: "stars",
      order: "desc",
      per_page: 100,
      page: 1,
    });
    // Waits between search requests only, not before the first one
    expect(h.sleep).toHaveBeenCalledTimes(1);
    expect(h.sleep).toHaveBeenCalledWith(2000);
  });

  it("treats a 422 past the result window as the end of the ranking", async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          incomplete_results: false,
          items: [searchItem({ owner: "a", name: "x", stars: 10 })],
        },
      })
      .mockRejectedValueOnce(httpError(422));
    const { client } = fakeClient(
      { JavaScript: [[{ owner: "a", name: "x", stars: 10, root: NODE_ROOT }]] },
      { search },
    );

    const { entries } = await buildDataset(client, params({ pages: 5 }), hooks());

    expect(search).toHaveBeenCalledTimes(2);
    expect(entries).toHaveLength(1);
  });

  it("drops forks and archived repositories found by the search", async () => {
    const { client, get } = fakeClient({
      JavaScript: [
        [
          { owner: "a", name: "fork", stars: 30, fork: true, root: NODE_ROOT },
          { owner: "a", name: "old", stars: 20, archived: true, root: NODE_ROOT },
          { owner: "a", name: "ok", stars: 10, root: NODE_ROOT },
        ],
      ],
    });

    const { entries, stats } = await buildDataset(client, params(), hooks());

    expect(entries.map((e) => e.full_name)).toEqual(["a/ok"]);
    expect(stats.search_results).toBe(3);
    expect(stats.candidates).toBe(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("rejects a repository that became a fork or archived since the search", async () => {
    const { client } = fakeClient({
      JavaScript: [
        [
          {
            owner: "a",
            name: "now-archived",
            stars: 20,
            meta: { archived: true },
            root: NODE_ROOT,
          },
          { owner: "a", name: "ok", stars: 10, root: NODE_ROOT },
        ],
      ],
    });

    const { entries, stats } = await buildDataset(client, params(), hooks());

    expect(entries.map((e) => e.full_name)).toEqual(["a/ok"]);
    expect(stats.rejected.fork_or_archived).toBe(1);
  });

  it("dedupes case-insensitively by owner/name, keeping the higher star count", async () => {
    const { client } = fakeClient({
      JavaScript: [[{ owner: "Org", name: "Lib", stars: 100, root: NODE_ROOT }]],
      TypeScript: [[{ owner: "org", name: "lib", stars: 300, root: NODE_ROOT }]],
    });

    const { entries, stats } = await buildDataset(
      client,
      params({
        languages: [DatasetLanguage.JAVASCRIPT, DatasetLanguage.TYPESCRIPT],
      }),
      hooks(),
    );

    expect(stats.candidates).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ full_name: "org/lib", stars: 300 });
  });

  it("skips a renamed repository whose canonical name was already selected", async () => {
    const { client } = fakeClient({
      JavaScript: [
        [
          { owner: "new", name: "tool", stars: 200, root: NODE_ROOT },
          {
            owner: "old",
            name: "tool",
            stars: 100,
            meta: { full_name: "New/Tool" },
            root: NODE_ROOT,
          },
        ],
      ],
    });

    const { entries, stats } = await buildDataset(client, params(), hooks());

    expect(entries.map((e) => e.full_name)).toEqual(["new/tool"]);
    expect(stats.rejected.duplicate_canonical).toBe(1);
  });

  it("stores the canonical name of a renamed repository", async () => {
    const { client } = fakeClient({
      JavaScript: [
        [
          {
            owner: "old",
            name: "tool",
            stars: 100,
            meta: {
              full_name: "new/tool2",
              name: "tool2",
              owner: { login: "new" },
              html_url: "https://github.com/new/tool2",
            },
            root: NODE_ROOT,
          },
        ],
      ],
    });

    const { entries } = await buildDataset(client, params(), hooks());

    expect(entries[0]).toMatchObject({
      full_name: "new/tool2",
      owner: "new",
      repo: "tool2",
      git_url: "https://github.com/new/tool2",
    });
  });

  it("requires a root package.json and one of the lockfiles", async () => {
    const { client } = fakeClient({
      JavaScript: [
        [
          { owner: "a", name: "no-pkg", stars: 50, root: ["yarn.lock"] },
          { owner: "a", name: "no-lock", stars: 40, root: ["package.json"] },
          { owner: "a", name: "empty", stars: 30 },
          { owner: "a", name: "gone", stars: 20, meta: "gone" },
          {
            owner: "a",
            name: "npm",
            stars: 10,
            root: ["package.json", "package-lock.json", "npm-shrinkwrap.json"],
          },
        ],
      ],
    });

    const { entries, stats } = await buildDataset(client, params(), hooks());

    expect(entries.map((e) => e.full_name)).toEqual(["a/npm"]);
    expect(entries[0]?.lockfiles).toEqual([
      "package-lock.json",
      "npm-shrinkwrap.json",
    ]);
    expect(stats.rejected).toMatchObject({
      no_package_json: 2,
      no_lockfile: 1,
      repo_gone: 1,
    });
  });

  it("rejects a repository without a default branch", async () => {
    const { client } = fakeClient({
      JavaScript: [
        [
          {
            owner: "a",
            name: "bare",
            stars: 20,
            meta: { default_branch: null },
            root: NODE_ROOT,
          },
        ],
      ],
    });

    const { entries, stats } = await buildDataset(client, params(), hooks());

    expect(entries).toHaveLength(0);
    expect(stats.rejected.no_branch).toBe(1);
  });

  it("stops probing once the limit is reached", async () => {
    const repos = [5, 4, 3, 2, 1].map((stars) => ({
      owner: "a",
      name: `r${stars}`,
      stars,
      root: NODE_ROOT,
    }));
    const { client, get } = fakeClient({ JavaScript: [repos] });

    const { entries, stats } = await buildDataset(
      client,
      params({ limit: 2 }),
      hooks(),
    );

    expect(entries.map((e) => e.rank)).toEqual([0, 1]);
    expect(entries.map((e) => e.full_name)).toEqual(["a/r5", "a/r4"]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(stats).toMatchObject({ candidates: 5, probed: 2, selected: 2 });
  });

  it("breaks star ties by lower-cased name in code point order", async () => {
    const { client } = fakeClient({
      JavaScript: [
        [
          { owner: "b", name: "x", stars: 10, root: NODE_ROOT },
          { owner: "a_", name: "x", stars: 10, root: NODE_ROOT },
          { owner: "A", name: "x", stars: 10, root: NODE_ROOT },
        ],
      ],
    });

    const { entries } = await buildDataset(client, params(), hooks());

    // "a/x" < "a_/x" ('/' is 0x2F, '_' is 0x5F) < "b/x"
    expect(entries.map((e) => e.full_name)).toEqual(["A/x", "a_/x", "b/x"]);
  });

  it("throws GithubRateLimited with the reset time when the rate limit is exhausted", async () => {
    const resetEpochSeconds = Math.floor(Date.now() / 1000) + 600;
    const get = jest.fn().mockRejectedValue(
      httpError(403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetEpochSeconds),
      }),
    );
    const { client } = fakeClient(
      { JavaScript: [[{ owner: "a", name: "x", stars: 10, root: NODE_ROOT }]] },
      { get },
    );

    const error = await buildDataset(client, params(), hooks()).catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(GithubRateLimited);
    expect((error as GithubRateLimited).retryAt).toBe(resetEpochSeconds * 1000);
  });

  it("treats a 403 without rate limit headers as an inaccessible repository", async () => {
    const get = jest.fn().mockRejectedValue(httpError(403));
    const { client } = fakeClient(
      { JavaScript: [[{ owner: "a", name: "x", stars: 10, root: NODE_ROOT }]] },
      { get },
    );

    const { entries, stats } = await buildDataset(client, params(), hooks());

    expect(entries).toHaveLength(0);
    expect(stats.rejected.repo_gone).toBe(1);
  });

  it("propagates unexpected GitHub errors", async () => {
    const search = jest.fn().mockRejectedValue(httpError(500));
    const { client } = fakeClient({ JavaScript: [] }, { search });

    await expect(buildDataset(client, params(), hooks())).rejects.toMatchObject({
      status: 500,
    });
  });

  it("calls beforeRequest before every GitHub request", async () => {
    const { client } = fakeClient({
      JavaScript: [[{ owner: "a", name: "x", stars: 10, root: NODE_ROOT }]],
    });
    const beforeRequest = jest.fn().mockResolvedValue(undefined);

    await buildDataset(client, params({ pages: 1 }), {
      ...hooks(),
      beforeRequest,
    });

    // one search page, GET /repos, root contents
    expect(beforeRequest).toHaveBeenCalledTimes(3);
  });
});
