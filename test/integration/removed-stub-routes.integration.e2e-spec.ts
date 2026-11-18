import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Routes that were never built (e2e)", () => {
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
      email: "admin@removed-stubs.com",
      role: MemberRole.ADMIN,
    });
  });

  it("answers 401 to an API key without a bearer token", async () => {
    const response = await testHelper.getApp().inject({
      method: "GET",
      url: "/org",
      headers: { "X-API-KEY": "x" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error_code).toBe("NotAuthenticated");
  });

  it.each([
    ["GET", "/api_keys"],
    ["POST", "/api_keys"],
    ["GET", "/api_keys/some-id/usage_logs"],
    ["DELETE", "/api_keys/some-id"],
  ] as const)("answers 404 to %s %s", async (method, url) => {
    const response = await testHelper.makeAuthenticatedRequest(
      method,
      url,
      user.accessToken,
    );

    expect(response.statusCode).toBe(404);
  });

  it("answers 404 to reading one organization member", async () => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/members/${user.user.id}`,
      user.accessToken,
    );

    expect(response.statusCode).toBe(404);
  });
});
