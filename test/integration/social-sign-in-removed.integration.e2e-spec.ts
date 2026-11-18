import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("GitHub and GitLab sign-in routes (e2e)", () => {
  let user: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@social-sign-in.com",
      role: MemberRole.ADMIN,
    });
  });

  it.each([
    ["GET", "/auth/github/authenticate?state=s"],
    ["POST", "/auth/github/finalize"],
    ["GET", "/auth/gitlab/authenticate?state=s"],
    ["POST", "/auth/gitlab/finalize"],
  ] as const)("answers 404 to %s %s", async (method, url) => {
    const response = await testHelper.makeRequest(method, url, {
      code: "code",
      state: "state",
    });

    expect(response.statusCode).toBe(404);
  });

  // POST /users/:email (resend the registration email) now matches this path.
  it("no longer completes a social account setup", async () => {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      "/users/complete_social_setup",
      user.accessToken,
      { first_name: "Ada", last_name: "Lovelace", handle: "adalovelace" },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("ValidationFailed");
  });

  it("still signs in with a password", async () => {
    const response = await testHelper.makeRequest(
      "POST",
      "/auth/authenticate",
      {
        email: "admin@social-sign-in.com",
        password: "TestPassword123!",
      },
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().data.token).toEqual(expect.any(String));
  });
});
