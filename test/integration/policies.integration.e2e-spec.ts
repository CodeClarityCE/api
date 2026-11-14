import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("Policy error statuses (e2e)", () => {
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
      email: "admin@policies.com",
      password: "AdminPassword123!",
      orgName: "Policy Organization",
      role: MemberRole.ADMIN,
    });
  });

  const vulnerabilityPolicy = (): string =>
    `/org/${admin.organization.id}/policies/vulnerability_policy`;
  const licensePolicy = (): string =>
    `/org/${admin.organization.id}/policies/license_policy`;

  it.each([
    ["GET", "vulnerability"],
    ["PATCH", "vulnerability"],
    ["DELETE", "vulnerability"],
    ["GET", "license"],
  ] as const)(
    "%s of an unknown %s policy returns 404",
    async (method, kind) => {
      const base = kind === "license" ? licensePolicy() : vulnerabilityPolicy();
      const response = await testHelper.makeAuthenticatedRequest(
        method,
        `${base}/${UNKNOWN_ID}`,
        admin.accessToken,
        method === "PATCH" ? { name: "Renamed policy" } : undefined,
      );

      expect(response.statusCode).toBe(404);
      expect(response.json().error_code).toBe("EntityNotFound");
    },
  );

  it.each([
    ["GET", "vulnerability"],
    ["DELETE", "vulnerability"],
    ["GET", "license"],
  ] as const)(
    "%s of a malformed %s policy id returns 400",
    async (method, kind) => {
      const base = kind === "license" ? licensePolicy() : vulnerabilityPolicy();
      const response = await testHelper.makeAuthenticatedRequest(
        method,
        `${base}/not-a-uuid`,
        admin.accessToken,
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("ValidationFailed");
    },
  );

  it("a malformed organization id returns 400 on the policy list", async () => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      "/org/not-a-uuid/policies/vulnerability_policy",
      admin.accessToken,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("ValidationFailed");
  });
});
