import axios from "axios";
import { lookup } from "dns/promises";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { RepositoryCache } from "../../src/base_modules/projects/repositoryCache.entity";
import { startFakeGitlab } from "../utils/fake-gitlab";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// The stand-in GitLab listens on 127.0.0.1 under this operator-allowed name.
const GITLAB_HOST = "gitlab.sync.test";
jest.mock("dns/promises", () => ({ lookup: jest.fn() }));
const mockedLookup = lookup as unknown as jest.Mock;

// GitHub's client is ESM-only, so the test answers its calls in place.
const mockListForAuthenticatedUser = jest.fn();
jest.mock("octokit", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: { repos: { listForAuthenticatedUser: mockListForAuthenticatedUser } },
  })),
}));

const GITLAB_SCOPES = [
  "read_repository",
  "read_user",
  "read_api",
  "self_rotate",
];

interface ProviderRepo {
  id: number;
  name: string;
  defaultBranch?: string;
  visibility?: string;
}

describe("Repository cache sync (e2e)", () => {
  let admin: TestUser;
  let gitlabUrl: string;
  let fakeGitlab: Awaited<ReturnType<typeof startFakeGitlab>>;
  // What each provider answers, as pages of repositories.
  let gitlabPages: ProviderRepo[][];
  let githubPages: ProviderRepo[][];
  // A page number the provider answers with a 500.
  let failingPage: number | undefined;
  let githubHead: jest.SpyInstance;
  const savedAllowlist = process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];

  function gitlabProject(repo: ProviderRepo): object {
    return {
      id: repo.id,
      name_with_namespace: `acme / ${repo.name}`,
      http_url_to_repo: `${gitlabUrl}/acme/${repo.name}.git`,
      default_branch: repo.defaultBranch ?? "main",
      visibility: repo.visibility ?? "private",
      created_at: "2026-01-01T00:00:00Z",
    };
  }

  function githubRepo(repo: ProviderRepo): object {
    return {
      id: repo.id,
      full_name: `acme/${repo.name}`,
      html_url: `https://github.com/acme/${repo.name}`,
      default_branch: repo.defaultBranch ?? "main",
      visibility: repo.visibility ?? "private",
      description: null,
      created_at: "2026-01-01T00:00:00Z",
    };
  }

  beforeAll(async () => {
    await testHelper.setupTestApp();
    fakeGitlab = await startFakeGitlab(GITLAB_HOST, (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/api/v4/personal_access_tokens/self") {
        return Response.json({ scopes: GITLAB_SCOPES });
      }
      if (parsed.pathname === "/api/v4/projects") {
        const page = Number(parsed.searchParams.get("page") ?? "1");
        if (page === failingPage) return new Response("boom", { status: 500 });
        const next = page < gitlabPages.length ? String(page + 1) : "";
        return Response.json((gitlabPages[page - 1] ?? []).map(gitlabProject), {
          headers: { "x-next-page": next },
        });
      }
      return new Response("not found", { status: 404 });
    });
    gitlabUrl = fakeGitlab.url;
  });

  afterAll(async () => {
    await fakeGitlab.close();
    await testHelper.teardownTestApp();
    if (savedAllowlist === undefined)
      delete process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
    else process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = savedAllowlist;
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    admin = await testHelper.createTestUser({
      email: "admin@repo-sync.com",
      orgName: "Repo Sync Org",
      role: MemberRole.ADMIN,
    });
    process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = GITLAB_HOST;
    mockedLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    gitlabPages = [];
    githubPages = [];
    failingPage = undefined;
    // GitHub token checks and the repository list, answered locally.
    githubHead = jest
      .spyOn(axios, "head")
      .mockResolvedValue({ headers: { "x-oauth-scopes": "repo" } });
    mockListForAuthenticatedUser.mockImplementation(
      async ({ page }: { page: number }) => {
        if (page === failingPage)
          throw Object.assign(new Error("boom"), { status: 500 });
        const last = Math.max(githubPages.length, 1);
        return {
          headers:
            last > 1
              ? {
                  link: `<https://api.github.com/user/repos?page=${last}>; rel="last"`,
                }
              : {},
          data: (githubPages[page - 1] ?? []).map(githubRepo),
        };
      },
    );
  });

  afterEach(() => {
    githubHead.mockRestore();
  });

  async function link(provider: "gitlab" | "github"): Promise<string> {
    const body =
      provider === "gitlab"
        ? {
            token: "glpat-test-token",
            token_type: "PERSONAL_ACCESS_TOKEN",
            gitlab_instance_url: gitlabUrl,
          }
        : { token: "ghp_syncTestToken123", token_type: "CLASSIC_TOKEN" };
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/integrations/${provider}/add`,
      admin.accessToken,
      body,
    );
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  function sync(provider: "gitlab" | "github", id: string): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/integrations/${provider}/${id}/repositories?force_refresh=true&entries_per_page=100`,
      admin.accessToken,
    );
  }

  async function cached(id: string): Promise<RepositoryCache[]> {
    return testHelper
      .getDataSource()
      .getRepository(RepositoryCache)
      .find({
        where: { integration: { id } },
        order: { fully_qualified_name: "ASC" },
      });
  }

  function setPages(provider: "gitlab" | "github", pages: ProviderRepo[][]) {
    if (provider === "gitlab") gitlabPages = pages;
    else githubPages = pages;
  }

  const nameOf = (provider: "gitlab" | "github", repo: string): string =>
    provider === "gitlab" ? `acme / ${repo}` : `acme/${repo}`;

  describe.each(["gitlab", "github"] as const)("%s", (provider) => {
    it("removes a repository the next full sync no longer returns", async () => {
      const id = await link(provider);
      setPages(provider, [
        [
          { id: 1, name: "app" },
          { id: 2, name: "lib" },
        ],
      ]);
      expect((await sync(provider, id)).statusCode).toBe(200);
      expect(await cached(id)).toHaveLength(2);

      setPages(provider, [[{ id: 1, name: "app" }]]);
      expect((await sync(provider, id)).statusCode).toBe(200);

      expect((await cached(id)).map((r) => r.fully_qualified_name)).toEqual([
        nameOf(provider, "app"),
      ]);
    });

    it("keeps one row with the new name and url for a renamed repository", async () => {
      const id = await link(provider);
      setPages(provider, [[{ id: 7, name: "old-name" }]]);
      await sync(provider, id);
      const [before] = await cached(id);

      setPages(provider, [[{ id: 7, name: "new-name" }]]);
      await sync(provider, id);

      const after = await cached(id);
      expect(after).toHaveLength(1);
      expect(after[0]!.id).toBe(before!.id);
      expect(after[0]!.fully_qualified_name).toBe(nameOf(provider, "new-name"));
      expect(after[0]!.url).toContain("new-name");
    });

    it("updates a changed default branch and visibility", async () => {
      const id = await link(provider);
      setPages(provider, [[{ id: 3, name: "app" }]]);
      await sync(provider, id);

      setPages(provider, [
        [{ id: 3, name: "app", defaultBranch: "trunk", visibility: "public" }],
      ]);
      await sync(provider, id);

      const [row] = await cached(id);
      expect(row!.default_branch).toBe("trunk");
      expect(row!.visibility).toBe("public");
    });

    it("deletes nothing when page 2 fails", async () => {
      const id = await link(provider);
      setPages(provider, [[{ id: 1, name: "app" }], [{ id: 2, name: "lib" }]]);
      expect((await sync(provider, id)).statusCode).toBe(200);
      expect(await cached(id)).toHaveLength(2);

      setPages(provider, [[{ id: 1, name: "app" }], []]);
      failingPage = 2;
      const response = await sync(provider, id);

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(await cached(id)).toHaveLength(2);
    });

    it("leaves one row per repository after two syncs at once", async () => {
      const id = await link(provider);
      setPages(provider, [
        [
          { id: 1, name: "app" },
          { id: 2, name: "lib" },
        ],
      ]);

      const responses = await Promise.all([
        sync(provider, id),
        sync(provider, id),
      ]);

      expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
      expect(await cached(id)).toHaveLength(2);
    });

    it("keeps an imported project working after its cache row is removed", async () => {
      const id = await link(provider);
      setPages(provider, [[{ id: 1, name: "app" }]]);
      await sync(provider, id);
      const [row] = await cached(id);
      const imported = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${admin.organization.id}/projects`,
        admin.accessToken,
        { integration_id: id, url: row!.url, name: "app", description: "" },
      );
      expect(imported.statusCode).toBe(201);

      setPages(provider, [[]]);
      await sync(provider, id);
      expect(await cached(id)).toEqual([]);

      const project = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${admin.organization.id}/projects/${imported.json().id}`,
        admin.accessToken,
      );
      expect(project.statusCode).toBe(200);
      expect(project.json().data.url).toBe(row!.url);
    });
  });

  it("leaves one row per GitHub repository after syncing twice", async () => {
    const id = await link("github");
    githubPages = [
      [
        { id: 1, name: "app" },
        { id: 2, name: "lib" },
      ],
    ];

    await sync("github", id);
    await sync("github", id);

    expect(await cached(id)).toHaveLength(2);
  });

  it("replaces duplicate GitHub rows cached before provider ids", async () => {
    const id = await link("github");
    githubPages = [[{ id: 1, name: "app" }]];
    await sync("github", id);
    const repo = testHelper.getDataSource().getRepository(RepositoryCache);
    const [row] = await cached(id);
    // Rows saved before this change have no provider id, often twice.
    await repo.update({ id: row!.id }, { provider_id: null });
    await repo.save(
      repo.create({
        ...row!,
        id: undefined,
        provider_id: null,
        integration: { id },
      } as any),
    );
    expect(await cached(id)).toHaveLength(2);

    await sync("github", id);

    const rows = await cached(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider_id).toBe("1");
  });
});
