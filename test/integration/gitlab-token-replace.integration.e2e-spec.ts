import { lookup } from "dns/promises";

import { Integration } from "../../src/base_modules/integrations/integrations.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { auditEntries } from "../utils/audit-log";
import { startFakeGitlab } from "../utils/fake-gitlab";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// The stand-in GitLab listens on 127.0.0.1 under this operator-allowed name.
const GITLAB_HOST = "gitlab.acme.io";
jest.mock("dns/promises", () => ({ lookup: jest.fn() }));
const mockedLookup = lookup as unknown as jest.Mock;
const OLD_TOKEN = "glpat-test-token";
const NEW_TOKEN = "glpat-test-token-new";
const ALL_SCOPES = ["read_repository", "read_user", "read_api", "self_rotate"];
const EXPIRES_AT = "2099-01-31";

// What the stand-in GitLab answers for each token's /personal_access_tokens/self.
interface TokenAnswer {
  status: number;
  body?: object;
}

describe("Replacing a GitLab integration's token (e2e)", () => {
  let admin: TestUser;
  let tokens: Record<string, TokenAnswer>;
  let projectsSeenWith: string[];
  let GITLAB_URL: string;
  let fakeGitlab: Awaited<ReturnType<typeof startFakeGitlab>>;
  let answer: Parameters<typeof startFakeGitlab>[1];
  const savedAllowlist = process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];

  beforeAll(async () => {
    await testHelper.setupTestApp();
    fakeGitlab = await startFakeGitlab(GITLAB_HOST, (url, init) =>
      answer(url, init),
    );
    GITLAB_URL = fakeGitlab.url;
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
      email: "admin@gitlab-replace.com",
      orgName: "GitLab Replace Org",
      role: MemberRole.ADMIN,
    });
    tokens = {
      [NEW_TOKEN]: {
        status: 200,
        body: { scopes: ALL_SCOPES, expires_at: EXPIRES_AT },
      },
    };
    projectsSeenWith = [];
    process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = GITLAB_HOST;
    mockedLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    // Answers GitLab's API locally: token info and the project list.
    answer = async (url, init) => {
      const token = init.headers["PRIVATE-TOKEN"]!;
      if (url === `${GITLAB_URL}/api/v4/personal_access_tokens/self`) {
        const answer = tokens[token] ?? { status: 401 };
        return new Response(JSON.stringify(answer.body ?? {}), {
          status: answer.status,
        });
      }
      if (url.startsWith(`${GITLAB_URL}/api/v4/projects`)) {
        projectsSeenWith.push(token);
        return new Response(
          JSON.stringify([
            {
              name_with_namespace: "acme / app",
              http_url_to_repo: `${GITLAB_URL}/acme/app.git`,
              default_branch: "main",
              visibility: "private",
              created_at: "2026-01-01T00:00:00Z",
            },
          ]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected request to ${url}`);
    };
  });

  async function linkGitlab(user: TestUser = admin): Promise<string> {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${user.organization.id}/integrations/gitlab/add`,
      user.accessToken,
      {
        token: OLD_TOKEN,
        token_type: "PERSONAL_ACCESS_TOKEN",
        gitlab_instance_url: GITLAB_URL,
      },
    );
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  function replace(
    integrationId: string,
    body: Partial<Record<string, string>> = {},
    user: TestUser = admin,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "PATCH",
      `/org/${admin.organization.id}/integrations/gitlab/${integrationId}`,
      user.accessToken,
      {
        token: NEW_TOKEN,
        token_type: "PERSONAL_ACCESS_TOKEN",
        gitlab_instance_url: GITLAB_URL,
        ...body,
      },
    );
  }

  function stored(id: string): Promise<Integration> {
    return testHelper
      .getDataSource()
      .getRepository(Integration)
      .findOneByOrFail({ id });
  }

  it("stores a valid new token, clears invalid and loads repositories with it", async () => {
    const id = await linkGitlab();
    await testHelper
      .getDataSource()
      .getRepository(Integration)
      .update({ id }, { invalid: true });

    const response = await replace(id);

    expect(response.statusCode).toBe(200);
    const integration = await stored(id);
    expect(integration.access_token).toBe(NEW_TOKEN);
    expect(integration.invalid).toBe(false);
    expect(integration.expiry_date?.toISOString()).toBe(
      new Date(EXPIRES_AT).toISOString(),
    );

    const repos = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/integrations/gitlab/${id}/repositories?force_refresh=true`,
      admin.accessToken,
    );
    expect(repos.statusCode).toBe(200);
    expect(repos.json().data.map((r: any) => r.fully_qualified_name)).toEqual([
      "acme / app",
    ]);
    expect(projectsSeenWith).toEqual([NEW_TOKEN]);
  });

  it("an integration whose private host is no longer allowed fails the sync with a clear error", async () => {
    const id = await linkGitlab();
    await replace(id);
    let requests = 0;
    const previous = answer;
    answer = (url, init) => {
      requests++;
      return previous(url, init);
    };
    delete process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];

    const repos = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/integrations/gitlab/${id}/repositories?force_refresh=true`,
      admin.accessToken,
    );

    expect(repos.statusCode).toBe(400);
    expect(repos.json().error_code).toBe("IntegrationInstanceUrlNotAllowed");
    expect(requests).toBe(0);
  });

  it("accepts the stored instance URL with a trailing slash", async () => {
    const id = await linkGitlab();

    const response = await replace(id, {
      gitlab_instance_url: `${GITLAB_URL}/`,
    });

    expect(response.statusCode).toBe(200);
    expect((await stored(id)).access_token).toBe(NEW_TOKEN);
  });

  it("writes one audit entry that never contains the token", async () => {
    const id = await linkGitlab();

    await replace(id);

    const entries = await auditEntries(admin, "OrganizationIntegrationUpdated");
    expect(entries).toEqual([
      expect.objectContaining({
        blame_on_email: "admin@gitlab-replace.com",
        description: expect.stringMatching(
          /GitLab.*http:\/\/gitlab\.acme\.io:\d+/,
        ),
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain(NEW_TOKEN);
    expect(JSON.stringify(entries)).not.toContain(OLD_TOKEN);
  });

  it.each([
    [
      "missing scopes",
      { status: 200, body: { scopes: ["read_api"] } },
      400,
      // The API spells this code with Integration twice.
      "IntegrationIntegrationTokenMissingPermissions",
    ],
    [
      "expired",
      { status: 200, body: { scopes: ALL_SCOPES, expires_at: "2020-01-01" } },
      400,
      "IntegrationTokenExpired",
    ],
    ["invalid", { status: 401 }, 400, "IntegrationInvalidToken"],
  ] as const)(
    "a token that is %s is refused and the stored token is kept",
    async (_name, answer, status, code) => {
      const id = await linkGitlab();
      tokens[NEW_TOKEN] = answer;

      const response = await replace(id);

      expect(response.statusCode).toBe(status);
      expect(response.json().error_code).toBe(code);
      expect((await stored(id)).access_token).toBe(OLD_TOKEN);
      expect(
        await auditEntries(admin, "OrganizationIntegrationUpdated"),
      ).toEqual([]);
    },
  );

  it("a token of the wrong form is refused as linking refuses it", async () => {
    const id = await linkGitlab();

    const response = await replace(id, { token: "not-a-gitlab-token" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("IntegrationWrongTokenType");
    expect((await stored(id)).access_token).toBe(OLD_TOKEN);
  });

  it("a different instance URL answers 400 and changes nothing", async () => {
    const id = await linkGitlab();

    const response = await replace(id, {
      gitlab_instance_url: "https://gitlab.other.io",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("IntegrationInstanceUrlChanged");
    const integration = await stored(id);
    expect(integration.access_token).toBe(OLD_TOKEN);
    expect(integration.service_domain).toBe(GITLAB_URL);
  });

  it("a member below admin gets 403", async () => {
    const id = await linkGitlab();
    const moderator = await testHelper.createTestUser({
      email: "moderator@gitlab-replace.com",
      organization: admin.organization,
      role: MemberRole.MODERATOR,
    });

    const response = await replace(id, {}, moderator);

    expect(response.statusCode).toBe(403);
    expect((await stored(id)).access_token).toBe(OLD_TOKEN);
  });

  it("an integration of another organization gets the same answer as for GitHub", async () => {
    const other = await testHelper.createTestUser({
      email: "other@gitlab-replace.com",
      orgName: "Other Org",
      role: MemberRole.ADMIN,
    });
    const foreign = await linkGitlab(other);

    const response = await replace(foreign);

    expect(response.statusCode).toBe(403);
    expect(response.json().error_code).toBe("NotAuthorized");
    expect((await stored(foreign)).access_token).toBe(OLD_TOKEN);
  });
});
