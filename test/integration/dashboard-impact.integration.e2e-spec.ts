import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";
import { VulnerabilityInstanceFixtures } from "../utils/vulnerability-instance-fixtures";

describe("Dashboard impact analysis (e2e)", () => {
  let user: TestUser;
  let seed: VulnerabilityInstanceFixtures;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@dashboard-impact.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  it("reads each project's current analysis and leaves out hidden and policy-excluded instances", async () => {
    const api = await seed.project("api");
    const finding = (id: string, cia: number) => ({
      id,
      dependency: "lodash",
      cia,
    });
    await seed.analysis({
      projectId: api,
      age: "2 days",
      workspaces: { ".": { findings: [finding("CVE-2099-9001", 0.1)] } },
    });
    await seed.analysis({
      projectId: api,
      age: "1 day",
      policyExcludes: ["CVE-2099-9003"],
      workspaces: {
        ".": {
          findings: [
            finding("CVE-2099-9002", 0.5),
            finding("CVE-2099-9003", 0.9),
            {
              ...finding("CVE-2099-9004", 0.8),
              verdicts: [
                { source: "gcve", verdict: "matched" },
                { source: "osv", verdict: "version_excluded" },
                { source: "nvd", verdict: "no_record" },
              ],
            },
          ],
        },
      },
    });
    await seed.analysis({
      projectId: api,
      branch: "feature",
      workspaces: { ".": { findings: [finding("CVE-2099-9005", 0.7)] } },
    });
    await seed.store();

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/dashboard/overall_cia_impact`,
      user.accessToken,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { cia: "Confidentiality", impact: 0.5 },
      { cia: "Integrity", impact: 0.5 },
      { cia: "Availability", impact: 0.5 },
    ]);
  });
});
