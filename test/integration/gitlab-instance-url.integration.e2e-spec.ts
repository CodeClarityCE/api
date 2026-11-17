import { Integration } from "../../src/base_modules/integrations/integrations.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const BASE = "https://gitlab.example.com";

// A valid GitLab URL of exactly `length` characters.
function urlOfLength(length: number): string {
  return `${BASE}/${"a".repeat(length - BASE.length - 1)}`;
}

describe("GitLab instance URL length (e2e)", () => {
  let admin: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    admin = await testHelper.createTestUser({
      email: "admin@gitlaburl.com",
      orgName: "GitLab URL Org",
      role: MemberRole.ADMIN,
    });
  });

  function linkGitlab(url: string): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/integrations/gitlab/add`,
      admin.accessToken,
      {
        token: "glpat-xxxxxxxxxxxxxxxxxxxx",
        token_type: "PERSONAL_ACCESS_TOKEN",
        gitlab_instance_url: url,
      },
    );
  }

  function integrations(): Promise<Integration[]> {
    return testHelper.getDataSource().getRepository(Integration).find();
  }

  it.each([BASE, urlOfLength(255)])(
    "links an instance whose URL is over 25 characters (%s)",
    async (url) => {
      const response = await linkGitlab(url);

      expect(response.statusCode).toBe(201);
      expect((await integrations()).map((i) => i.service_domain)).toEqual([
        url,
      ]);
    },
  );

  it("answers ValidationFailed for a URL over 255 characters and saves nothing", async () => {
    const response = await linkGitlab(urlOfLength(256));

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("ValidationFailed");
    expect(await integrations()).toEqual([]);
  });
});
