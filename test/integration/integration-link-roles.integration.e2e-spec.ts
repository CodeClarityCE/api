import axios from "axios";
import { randomUUID } from "crypto";

import { Integration } from "../../src/base_modules/integrations/integrations.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { auditEntries } from "../utils/audit-log";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const PROVIDERS = [
  {
    name: "GitHub",
    path: "/github/add",
    body: { token: "ghp_roleCheckToken123", token_type: "CLASSIC_TOKEN" },
  },
  {
    name: "GitLab",
    path: "/gitlab/add",
    body: {
      token: "glpat-xxxxxxxxxxxxxxxxxxxx",
      token_type: "PERSONAL_ACCESS_TOKEN",
      gitlab_instance_url: "https://gitlab.com",
    },
  },
];

describe("Who may link a GitHub or GitLab integration (e2e)", () => {
  let owner: TestUser;
  let githubHead: jest.SpyInstance;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@linkroles.com",
      orgName: "Link Roles Org",
      role: MemberRole.OWNER,
    });
    // Answer GitHub token checks locally: a token with the repo scope, no expiry.
    githubHead = jest
      .spyOn(axios, "head")
      .mockResolvedValue({ headers: { "x-oauth-scopes": "repo" } });
  });

  afterEach(() => {
    githubHead.mockRestore();
  });

  function link(
    user: TestUser,
    provider: (typeof PROVIDERS)[number],
    orgId: string = owner.organization.id,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/integrations${provider.path}`,
      user.accessToken,
      provider.body,
    );
  }

  function member(role: MemberRole): Promise<TestUser> {
    return testHelper.createTestUser({
      email: `${MemberRole[role].toLowerCase()}@linkroles.com`,
      organization: owner.organization,
      role,
    });
  }

  function integrationCount(): Promise<number> {
    return testHelper.getDataSource().getRepository(Integration).count();
  }

  async function expectRefused(response: any): Promise<void> {
    expect(response.statusCode).toBe(403);
    expect(response.json().error_code).toBe("NotAuthorized");
    expect(await integrationCount()).toBe(0);
    expect(await auditEntries(owner, "OrganizationIntegrationAdded")).toEqual(
      [],
    );
    expect(githubHead).not.toHaveBeenCalled();
  }

  describe.each(PROVIDERS)("$name", (provider) => {
    it("lets an owner link it", async () => {
      const response = await link(owner, provider);

      expect(response.statusCode).toBe(201);
      expect(await integrationCount()).toBe(1);
      expect(
        await auditEntries(owner, "OrganizationIntegrationAdded"),
      ).toHaveLength(1);
    });

    it("lets an admin link it", async () => {
      const admin = await member(MemberRole.ADMIN);

      const response = await link(admin, provider);

      expect(response.statusCode).toBe(201);
      expect(await integrationCount()).toBe(1);
      expect(await auditEntries(owner, "OrganizationIntegrationAdded")).toEqual(
        [expect.objectContaining({ blame_on_email: "admin@linkroles.com" })],
      );
    });

    it.each([MemberRole.USER, MemberRole.MODERATOR])(
      "refuses a member with role %s",
      async (role) => {
        const below = await member(role);

        await expectRefused(await link(below, provider));
      },
    );

    it("refuses a signed-in user who is not a member", async () => {
      const outsider = await testHelper.createTestUser({
        email: "outsider@linkroles.com",
        orgName: "Outsider Org",
        role: MemberRole.OWNER,
      });

      await expectRefused(await link(outsider, provider));
    });

    it("refuses an organization that does not exist with 403, not 404", async () => {
      await expectRefused(await link(owner, provider, randomUUID()));
    });
  });
});
