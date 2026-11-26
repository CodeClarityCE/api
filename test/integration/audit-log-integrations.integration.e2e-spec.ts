import axios from "axios";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { auditEntries, readAuditLog } from "../utils/audit-log";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// Instance names resolve to a public address without real DNS.
jest.mock("dns/promises", () => ({
  lookup: jest.fn().mockResolvedValue([{ address: "203.0.113.10", family: 4 }]),
}));

const GITHUB_TOKEN = "ghp_secretGithubToken123";
const GITHUB_NEW_TOKEN = "ghp_rotatedGithubToken456";
const GITLAB_TOKEN = "glpat-test-token";
const GITLAB_URL = "https://gitlab.acme.io";

describe("Audit log for integrations (e2e)", () => {
  let admin: TestUser;
  let member: TestUser;
  let githubHead: jest.SpyInstance;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    admin = await testHelper.createTestUser({
      email: "admin@integrations.com",
      orgName: "Integrations Org",
      role: MemberRole.ADMIN,
    });
    member = await testHelper.createTestUser({
      email: "member@integrations.com",
      organization: admin.organization,
      role: MemberRole.USER,
    });
    // Answer GitHub token checks locally: a token with the repo scope, no expiry.
    githubHead = jest
      .spyOn(axios, "head")
      .mockResolvedValue({ headers: { "x-oauth-scopes": "repo" } });
  });

  afterEach(() => {
    githubHead.mockRestore();
  });

  function request(
    user: TestUser,
    method: "POST" | "PATCH" | "DELETE",
    url: string,
    body?: object,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      method,
      `/org/${admin.organization.id}/integrations${url}`,
      user.accessToken,
      body,
    );
  }

  async function linkGithub(): Promise<string> {
    const response = await request(admin, "POST", "/github/add", {
      token: GITHUB_TOKEN,
      token_type: "CLASSIC_TOKEN",
    });
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  async function linkGitlab(): Promise<string> {
    const response = await request(admin, "POST", "/gitlab/add", {
      token: GITLAB_TOKEN,
      token_type: "PERSONAL_ACCESS_TOKEN",
      gitlab_instance_url: GITLAB_URL,
    });
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  async function descriptions(): Promise<string> {
    return (await readAuditLog(admin)).map((e) => e.description).join("\n");
  }

  describe("linking an integration", () => {
    it("records who linked GitHub and where", async () => {
      await linkGithub();

      expect(await auditEntries(admin, "OrganizationIntegrationAdded")).toEqual(
        [
          expect.objectContaining({
            action_class: "Organization",
            action_severity: 3,
            blame_on_email: "admin@integrations.com",
            description: expect.stringMatching(/GitHub.*github\.com/),
          }),
        ],
      );
    });

    it("records who linked GitLab and which instance", async () => {
      await linkGitlab();

      expect(await auditEntries(admin, "OrganizationIntegrationAdded")).toEqual(
        [
          expect.objectContaining({
            action_severity: 3,
            blame_on_email: "admin@integrations.com",
            description: expect.stringMatching(
              /GitLab.*https:\/\/gitlab\.acme\.io/,
            ),
          }),
        ],
      );
    });

    it("never writes the token", async () => {
      await linkGithub();
      await linkGitlab();

      const text = await descriptions();
      expect(text).not.toContain(GITHUB_TOKEN);
      expect(text).not.toContain(GITLAB_TOKEN);
    });

    it("writes nothing when GitHub rejects the token", async () => {
      githubHead.mockRejectedValue({ response: { status: 401 } });

      const response = await request(admin, "POST", "/github/add", {
        token: GITHUB_TOKEN,
        token_type: "CLASSIC_TOKEN",
      });

      expect(response.statusCode).toBe(400);
      expect(await auditEntries(admin, "OrganizationIntegrationAdded")).toEqual(
        [],
      );
    });

    it("writes nothing when the GitLab token has the wrong form", async () => {
      const response = await request(admin, "POST", "/gitlab/add", {
        token: "not-a-gitlab-token",
        token_type: "PERSONAL_ACCESS_TOKEN",
        gitlab_instance_url: GITLAB_URL,
      });

      expect(response.statusCode).toBe(400);
      expect(await auditEntries(admin, "OrganizationIntegrationAdded")).toEqual(
        [],
      );
    });
  });

  describe("updating an integration", () => {
    it("records who replaced the GitHub token, without the token", async () => {
      const integrationId = await linkGithub();

      const response = await request(
        admin,
        "PATCH",
        `/github/${integrationId}`,
        {
          token: GITHUB_NEW_TOKEN,
          token_type: "CLASSIC_TOKEN",
        },
      );

      expect(response.statusCode).toBe(200);
      expect(
        await auditEntries(admin, "OrganizationIntegrationUpdated"),
      ).toEqual([
        expect.objectContaining({
          action_class: "Organization",
          action_severity: 3,
          blame_on_email: "admin@integrations.com",
          description: expect.stringMatching(/GitHub.*github\.com/),
        }),
      ]);
      const text = await descriptions();
      expect(text).not.toContain(GITHUB_TOKEN);
      expect(text).not.toContain(GITHUB_NEW_TOKEN);
    });

    it("writes nothing when a non-admin tries to update", async () => {
      const integrationId = await linkGithub();

      const response = await request(
        member,
        "PATCH",
        `/github/${integrationId}`,
        { token: GITHUB_NEW_TOKEN, token_type: "CLASSIC_TOKEN" },
      );

      expect(response.statusCode).toBe(403);
      expect(
        await auditEntries(admin, "OrganizationIntegrationUpdated"),
      ).toEqual([]);
    });
  });

  describe("removing an integration", () => {
    it("records who removed GitLab and which instance", async () => {
      const integrationId = await linkGitlab();

      const response = await request(admin, "DELETE", `/${integrationId}`);

      expect(response.statusCode).toBe(200);
      expect(
        await auditEntries(admin, "OrganizationIntegrationDeleted"),
      ).toEqual([
        expect.objectContaining({
          action_class: "Organization",
          action_severity: 3,
          blame_on_email: "admin@integrations.com",
          description: expect.stringMatching(
            /GitLab.*https:\/\/gitlab\.acme\.io/,
          ),
        }),
      ]);
      expect(await descriptions()).not.toContain(GITLAB_TOKEN);
    });

    it("writes nothing and keeps the integration when a non-admin tries", async () => {
      const integrationId = await linkGithub();

      const response = await request(member, "DELETE", `/${integrationId}`);

      expect(response.statusCode).toBe(403);
      expect(
        await auditEntries(admin, "OrganizationIntegrationDeleted"),
      ).toEqual([]);
      const list = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${admin.organization.id}/integrations/vcs`,
        admin.accessToken,
      );
      expect(list.json().data).toHaveLength(1);
    });
  });
});
