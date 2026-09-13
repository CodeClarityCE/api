import { Test, type TestingModule } from "@nestjs/testing";

import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
} from "src/base_modules/shared/repositories";

import {
  FailedToRetrieveReposFromProvider,
  IntegrationInvalidToken,
  NotAuthorized,
} from "../../../types/error.types";
import { SortDirection } from "../../../types/sort.types";
import { AuthenticatedUser, ROLE } from "../../auth/auth.types";
import { MemberRole } from "../../organizations/memberships/orgMembership.types";

import { CONST_POPULAR_REPOS_LIMIT } from "./constants";
import { GithubIntegrationService } from "./github.service";
import { GithubPopularReposService } from "./githubPopularRepos.service";

const mockSearchRepos = jest.fn();

// Mock dynamic import of octokit
jest.mock("octokit", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      search: {
        repos: mockSearchRepos,
      },
    },
  })),
}));

interface SearchItemOverrides {
  id: number;
  full_name: string;
  stargazers_count: number;
  language?: string | null;
  description?: string | null;
  default_branch?: string;
  visibility?: string;
  created_at?: string | null;
  fork?: boolean;
  archived?: boolean;
  disabled?: boolean;
}

function searchItem(overrides: SearchItemOverrides): Record<string, unknown> {
  return {
    html_url: `https://github.com/${overrides.full_name}`,
    default_branch: "main",
    visibility: "public",
    description: "A description",
    created_at: "2020-01-02T03:04:05Z",
    language: "JavaScript",
    fork: false,
    archived: false,
    disabled: false,
    ...overrides,
  };
}

function searchResponse(
  items: Record<string, unknown>[],
  incomplete = false,
): { data: Record<string, unknown> } {
  return {
    data: {
      total_count: items.length,
      incomplete_results: incomplete,
      items,
    },
  };
}

const MINUTE = 60_000;
const T0 = new Date("2026-09-12T10:00:00Z").getTime();

describe("GithubPopularReposService", () => {
  let service: GithubPopularReposService;
  let githubIntegrationService: { getToken: jest.Mock };
  let membershipsRepository: { hasRequiredRole: jest.Mock };
  let organizationsRepository: { doesIntegrationBelongToOrg: jest.Mock };
  let projectsRepository: { getImportedUrlsInOrg: jest.Mock };
  let nowSpy: jest.SpyInstance<number, []>;

  const user = new AuthenticatedUser("test-user-id", [ROLE.USER], true);
  const orgId = "test-org-id";
  const integrationId = "test-integration-id";

  beforeEach(async () => {
    mockSearchRepos.mockReset();
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(T0);

    githubIntegrationService = {
      getToken: jest.fn().mockResolvedValue({
        validate: jest.fn(),
        getToken: () => "ghp_test_token",
      }),
    };
    membershipsRepository = {
      hasRequiredRole: jest.fn().mockResolvedValue(undefined),
    };
    organizationsRepository = {
      doesIntegrationBelongToOrg: jest.fn().mockResolvedValue(true),
    };
    projectsRepository = {
      getImportedUrlsInOrg: jest.fn().mockResolvedValue(new Set<string>()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GithubPopularReposService,
        {
          provide: GithubIntegrationService,
          useValue: githubIntegrationService,
        },
        { provide: MembershipsRepository, useValue: membershipsRepository },
        { provide: OrganizationsRepository, useValue: organizationsRepository },
        { provide: ProjectsRepository, useValue: projectsRepository },
      ],
    }).compile();

    service = module.get<GithubPopularReposService>(GithubPopularReposService);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  function list(
    languages: ("JavaScript" | "TypeScript" | "PHP")[] = ["PHP"],
    options: {
      page?: number;
      entriesPerPage?: number;
      searchKey?: string;
      forceRefresh?: boolean;
      filters?: string[];
      sortBy?: string;
      sortDirection?: SortDirection;
    } = {},
  ) {
    return service.getPopularGithubRepositories(
      orgId,
      integrationId,
      { currentPage: options.page, entriesPerPage: options.entriesPerPage },
      user,
      languages,
      options.searchKey,
      options.forceRefresh,
      options.filters,
      options.sortBy,
      options.sortDirection,
    );
  }

  it("throws NotAuthorized when the integration does not belong to the org", async () => {
    organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(false);

    await expect(list()).rejects.toThrow(NotAuthorized);
    expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    expect(mockSearchRepos).not.toHaveBeenCalled();
  });

  it("runs one GitHub search per requested language with the star ranking query", async () => {
    mockSearchRepos.mockResolvedValue(searchResponse([]));

    await list(["TypeScript", "PHP"]);

    expect(mockSearchRepos).toHaveBeenCalledTimes(2);
    expect(mockSearchRepos).toHaveBeenCalledWith({
      q: "stars:>1000 language:TypeScript",
      sort: "stars",
      order: "desc",
      per_page: 100,
      page: 1,
    });
    expect(mockSearchRepos).toHaveBeenCalledWith({
      q: "stars:>1000 language:PHP",
      sort: "stars",
      order: "desc",
      per_page: 100,
      page: 1,
    });
  });

  it("defaults to every supported language when none is requested", async () => {
    mockSearchRepos.mockResolvedValue(searchResponse([]));

    await list([]);

    const queries = mockSearchRepos.mock.calls.map(
      (call: [{ q: string }]) => call[0].q,
    );
    expect(queries).toEqual([
      "stars:>1000 language:JavaScript",
      "stars:>1000 language:TypeScript",
      "stars:>1000 language:PHP",
    ]);
  });

  it("merges languages, drops forks/archived/disabled, ranks by stars and truncates", async () => {
    const js = Array.from({ length: 70 }, (_, i) =>
      searchItem({
        id: i + 1,
        full_name: `js/repo-${i + 1}`,
        stargazers_count: 2000 + i + 1,
      }),
    );
    // ids 51..70 overlap with the JavaScript page (same repo, same stars)
    const ts = Array.from({ length: 70 }, (_, i) =>
      searchItem({
        id: i + 51,
        full_name: `ts/repo-${i + 51}`,
        stargazers_count: 2000 + i + 51,
        language: "TypeScript",
      }),
    );
    js.push(
      searchItem({
        id: 900,
        full_name: "x/fork",
        stargazers_count: 99_999,
        fork: true,
      }),
      searchItem({
        id: 901,
        full_name: "x/archived",
        stargazers_count: 99_998,
        archived: true,
      }),
      searchItem({
        id: 902,
        full_name: "x/disabled",
        stargazers_count: 99_997,
        disabled: true,
      }),
    );
    mockSearchRepos.mockImplementation(({ q }: { q: string }) =>
      Promise.resolve(searchResponse(q.includes("TypeScript") ? ts : js)),
    );

    const result = await list(["JavaScript", "TypeScript"], {
      entriesPerPage: 100,
    });

    // 120 unique repositories, truncated to the limit, highest stars first
    expect(result.total_entries).toBe(CONST_POPULAR_REPOS_LIMIT);
    expect(result.data).toHaveLength(CONST_POPULAR_REPOS_LIMIT);
    expect(result.data[0]!.id).toBe("120");
    expect(result.data[0]!.stargazers_count).toBe(2120);
    expect(result.data[CONST_POPULAR_REPOS_LIMIT - 1]!.id).toBe("21");
    const ids = result.data.map((repo) => repo.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("900");
    expect(ids).not.toContain("901");
    expect(ids).not.toContain("902");
    expect(ids).not.toContain("20");
  });

  it("maps search items to the repository DTO", async () => {
    mockSearchRepos.mockResolvedValue(
      searchResponse([
        searchItem({
          id: 42,
          full_name: "octo/legacy",
          stargazers_count: 5000,
          default_branch: "master",
          description: null,
          language: null,
          created_at: "2015-03-04T05:06:07Z",
        }),
      ]),
    );

    const result = await list(["PHP"]);

    expect(result.data).toHaveLength(1);
    const repo = result.data[0]!;
    expect(repo).toMatchObject({
      id: "42",
      url: "https://github.com/octo/legacy",
      default_branch: "master",
      visibility: "public",
      fully_qualified_name: "octo/legacy",
      description: "",
      imported_already: false,
      integration_id: integrationId,
      stargazers_count: 5000,
      language: "PHP",
    });
    expect(repo.created_at).toEqual(new Date("2015-03-04T05:06:07Z"));
  });

  it("flags repositories already imported in the org and honours only_non_imported", async () => {
    mockSearchRepos.mockResolvedValue(
      searchResponse([
        searchItem({ id: 1, full_name: "a/one", stargazers_count: 3000 }),
        searchItem({ id: 2, full_name: "a/two", stargazers_count: 2000 }),
      ]),
    );
    projectsRepository.getImportedUrlsInOrg.mockResolvedValue(
      new Set(["https://github.com/a/one"]),
    );

    const all = await list(["PHP"]);
    expect(projectsRepository.getImportedUrlsInOrg).toHaveBeenCalledWith(
      orgId,
      ["https://github.com/a/one", "https://github.com/a/two"],
    );
    expect(all.data.map((repo) => [repo.id, repo.imported_already])).toEqual([
      ["1", true],
      ["2", false],
    ]);

    const notImported = await list(["PHP"], { filters: ["only_non_imported"] });
    expect(notImported.total_entries).toBe(1);
    expect(notImported.data.map((repo) => repo.id)).toEqual(["2"]);
  });

  it("filters by search key on name or description, case-insensitively", async () => {
    mockSearchRepos.mockResolvedValue(
      searchResponse([
        searchItem({
          id: 1,
          full_name: "vuejs/core",
          stargazers_count: 3000,
          description: "Framework",
        }),
        searchItem({
          id: 2,
          full_name: "acme/tool",
          stargazers_count: 2000,
          description: "A Vue helper",
        }),
        searchItem({
          id: 3,
          full_name: "acme/other",
          stargazers_count: 1000,
          description: "Unrelated",
        }),
      ]),
    );

    const result = await list(["PHP"], { searchKey: "VUE" });

    expect(result.data.map((repo) => repo.id)).toEqual(["1", "2"]);
    expect(result.matching_count).toBe(2);
  });

  it("paginates the ranked list and caps entries per page at 100", async () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      searchItem({
        id: i + 1,
        full_name: `a/repo-${i + 1}`,
        stargazers_count: 1000 + 30 - i,
      }),
    );
    mockSearchRepos.mockResolvedValue(searchResponse(items));

    const page = await list(["PHP"], { page: 1, entriesPerPage: 10 });
    expect(page.page).toBe(1);
    expect(page.entries_per_page).toBe(10);
    expect(page.entry_count).toBe(10);
    expect(page.total_entries).toBe(30);
    expect(page.total_pages).toBe(3);
    expect(page.data.map((repo) => repo.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 11)),
    );

    const capped = await list(["PHP"], { entriesPerPage: 500 });
    expect(capped.entries_per_page).toBe(100);

    const defaults = await list(["PHP"]);
    expect(defaults.entries_per_page).toBe(20);
    expect(defaults.data).toHaveLength(20);
  });

  it("falls back to the default page size for non-positive sizes and starts pages at 0", async () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      searchItem({
        id: i + 1,
        full_name: `a/repo-${i + 1}`,
        stargazers_count: 1000 + 30 - i,
      }),
    );
    mockSearchRepos.mockResolvedValue(searchResponse(items));

    for (const entriesPerPage of [-1, 0]) {
      const result = await list(["PHP"], { entriesPerPage });
      expect(result.entries_per_page).toBe(20);
      expect(result.data).toHaveLength(20);
      expect(result.total_pages).toBe(2);
    }

    const negativePage = await list(["PHP"], { page: -3, entriesPerPage: 10 });
    expect(negativePage.page).toBe(0);
    expect(negativePage.data[0]!.id).toBe("1");
  });

  it("sorts by the requested key and keeps the star ranking for unknown keys", async () => {
    mockSearchRepos.mockResolvedValue(
      searchResponse([
        searchItem({ id: 1, full_name: "b/mid", stargazers_count: 2000 }),
        searchItem({ id: 2, full_name: "a/top", stargazers_count: 3000 }),
        searchItem({ id: 3, full_name: "c/low", stargazers_count: 1000 }),
      ]),
    );

    const byName = await list(["PHP"], {
      sortBy: "fully_qualified_name",
      sortDirection: SortDirection.ASC,
    });
    expect(byName.data.map((repo) => repo.id)).toEqual(["2", "1", "3"]);

    const byStarsAsc = await list(["PHP"], {
      sortBy: "stars",
      sortDirection: SortDirection.ASC,
    });
    expect(byStarsAsc.data.map((repo) => repo.id)).toEqual(["3", "1", "2"]);

    const unknown = await list(["PHP"], { sortBy: "nonsense" });
    expect(unknown.data.map((repo) => repo.id)).toEqual(["2", "1", "3"]);
  });

  it.each(["hasOwnProperty", "__proto__", "constructor", "toString"])(
    "keeps the star ranking for the Object.prototype sort key %s",
    async (sortBy) => {
      // Star order (2, 1, 3) deliberately differs from name order (1, 3, 2).
      mockSearchRepos.mockResolvedValue(
        searchResponse([
          searchItem({ id: 1, full_name: "a/mid", stargazers_count: 2000 }),
          searchItem({ id: 2, full_name: "c/top", stargazers_count: 3000 }),
          searchItem({ id: 3, full_name: "b/low", stargazers_count: 1000 }),
        ]),
      );

      const result = await list(["PHP"], {
        sortBy,
        sortDirection: SortDirection.ASC,
      });

      expect(result.data.map((repo) => repo.id)).toEqual(["2", "1", "3"]);
    },
  );

  it("serves repeated requests from the cache without asking GitHub or resolving the token again", async () => {
    mockSearchRepos.mockResolvedValue(
      searchResponse([
        searchItem({ id: 1, full_name: "a/one", stargazers_count: 3000 }),
      ]),
    );

    await list(["PHP"]);
    nowSpy.mockReturnValue(T0 + 30 * MINUTE);
    const second = await list(["PHP"]);

    expect(second.data).toHaveLength(1);
    expect(mockSearchRepos).toHaveBeenCalledTimes(1);
    expect(githubIntegrationService.getToken).toHaveBeenCalledTimes(1);
  });

  it("asks GitHub again once the cache entry expired", async () => {
    mockSearchRepos.mockResolvedValue(searchResponse([]));

    await list(["PHP"]);
    nowSpy.mockReturnValue(T0 + 61 * MINUTE);
    await list(["PHP"]);

    expect(mockSearchRepos).toHaveBeenCalledTimes(2);
  });

  it("honours force_refresh only when the cached ranking is older than the refresh floor", async () => {
    mockSearchRepos.mockResolvedValue(searchResponse([]));

    await list(["PHP"]);
    nowSpy.mockReturnValue(T0 + 1 * MINUTE);
    await list(["PHP"], { forceRefresh: true });
    expect(mockSearchRepos).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(T0 + 6 * MINUTE);
    await list(["PHP"], { forceRefresh: true });
    expect(mockSearchRepos).toHaveBeenCalledTimes(2);
  });

  it("caches an incomplete GitHub result for a short time only", async () => {
    mockSearchRepos.mockResolvedValue(searchResponse([], true));

    await list(["PHP"]);
    nowSpy.mockReturnValue(T0 + 6 * MINUTE);
    await list(["PHP"]);

    expect(mockSearchRepos).toHaveBeenCalledTimes(2);
  });

  it("maps a 401 to IntegrationInvalidToken and rate limits to FailedToRetrieveReposFromProvider", async () => {
    mockSearchRepos.mockRejectedValueOnce({ status: 401 });
    await expect(list(["PHP"])).rejects.toThrow(IntegrationInvalidToken);

    mockSearchRepos.mockRejectedValueOnce({
      status: 403,
      response: {
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1" },
      },
    });
    await expect(list(["PHP"])).rejects.toThrow(
      FailedToRetrieveReposFromProvider,
    );

    mockSearchRepos.mockRejectedValueOnce({ status: 500 });
    await expect(list(["PHP"])).rejects.toThrow(
      FailedToRetrieveReposFromProvider,
    );
  });

  it("rethrows errors without a status untouched", async () => {
    const boom = new Error("socket hang up");
    mockSearchRepos.mockRejectedValueOnce(boom);

    await expect(list(["PHP"])).rejects.toBe(boom);
  });

  it("serves the stale ranking when a refresh hits a provider error, but not on token errors", async () => {
    mockSearchRepos.mockResolvedValueOnce(
      searchResponse([
        searchItem({ id: 1, full_name: "a/one", stargazers_count: 3000 }),
      ]),
    );
    await list(["PHP"]);

    nowSpy.mockReturnValue(T0 + 61 * MINUTE);
    mockSearchRepos.mockRejectedValueOnce({ status: 403 });
    const stale = await list(["PHP"]);
    expect(stale.data.map((repo) => repo.id)).toEqual(["1"]);

    mockSearchRepos.mockRejectedValueOnce({ status: 401 });
    await expect(list(["PHP"])).rejects.toThrow(IntegrationInvalidToken);
  });

  it("coalesces concurrent cold requests through the same integration into a single GitHub call", async () => {
    let resolveSearch!: (value: unknown) => void;
    mockSearchRepos.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    const first = list(["PHP"]);
    const second = list(["PHP"]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSearchRepos).toHaveBeenCalledTimes(1);

    resolveSearch(
      searchResponse([
        searchItem({ id: 1, full_name: "a/one", stargazers_count: 3000 }),
      ]),
    );
    const [a, b] = await Promise.all([first, second]);
    expect(a.data.map((repo) => repo.id)).toEqual(["1"]);
    expect(b.data.map((repo) => repo.id)).toEqual(["1"]);
    expect(mockSearchRepos).toHaveBeenCalledTimes(1);
  });

  it("refreshes separately per integration so a failing token only fails its own request", async () => {
    let rejectFirstSearch!: (reason: unknown) => void;
    mockSearchRepos
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstSearch = reject;
          }),
      )
      .mockResolvedValueOnce(
        searchResponse([
          searchItem({ id: 1, full_name: "a/one", stargazers_count: 3000 }),
        ]),
      );

    const failing = list(["PHP"]);
    const healthy = service.getPopularGithubRepositories(
      orgId,
      "other-integration-id",
      {},
      user,
      ["PHP"],
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSearchRepos).toHaveBeenCalledTimes(2);

    rejectFirstSearch({ status: 401 });

    await expect(failing).rejects.toThrow(IntegrationInvalidToken);
    await expect(healthy).resolves.toMatchObject({ total_entries: 1 });
  });
});
