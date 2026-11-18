import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import {
  createAnalysisWithPolicies,
  createProject,
} from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

interface PolicyRow {
  id: string;
  name: string;
  description: string;
  default: boolean;
  content: string[];
  created_by: string;
}

describe("License policy update and delete (e2e)", () => {
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
      email: "admin@license-policies.com",
      password: "AdminPassword123!",
      orgName: "License Policy Organization",
      role: MemberRole.ADMIN,
    });
  });

  const base = (user: TestUser = admin): string =>
    `/org/${user.organization.id}/policies/license_policy`;

  async function createPolicy(
    user: TestUser,
    overrides: Partial<{
      name: string;
      description: string;
      licenses: string[];
      default: boolean;
    }> = {},
  ): Promise<string> {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      base(user),
      user.accessToken,
      {
        name: "No copyleft",
        description: "Blocks copyleft licenses",
        type: "BLACKLIST",
        licenses: ["GPL-3.0"],
        default: false,
        ...overrides,
      },
    );
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  async function getPolicy(user: TestUser, id: string): Promise<PolicyRow> {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${base(user)}/${id}`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json().data;
  }

  async function listPolicies(user: TestUser): Promise<PolicyRow[]> {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      base(user),
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json().data;
  }

  async function otherOrgAdmin(): Promise<TestUser> {
    return testHelper.createTestUser({
      email: "other-admin@other-org.com",
      password: "AdminPassword123!",
      orgName: "Other Organization",
      role: MemberRole.ADMIN,
    });
  }

  describe("PATCH", () => {
    it("changes only the fields sent", async () => {
      const id = await createPolicy(admin);

      const response = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `${base()}/${id}`,
        admin.accessToken,
        { name: "Renamed policy", licenses: ["AGPL-3.0", "GPL-2.0"] },
      );

      expect(response.statusCode).toBe(200);
      expect(await getPolicy(admin, id)).toMatchObject({
        name: "Renamed policy",
        description: "Blocks copyleft licenses",
        content: ["AGPL-3.0", "GPL-2.0"],
        default: false,
      });
    });

    it("accepts an empty description, as create does", async () => {
      const id = await createPolicy(admin);

      const response = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `${base()}/${id}`,
        admin.accessToken,
        { description: "" },
      );

      expect(response.statusCode).toBe(200);
      expect((await getPolicy(admin, id)).description).toBe("");
    });

    it("making a policy the default clears the other license defaults", async () => {
      const first = await createPolicy(admin, {
        name: "First policy",
        default: true,
      });
      const second = await createPolicy(admin, { name: "Second policy" });
      const vulnerabilityDefault = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${admin.organization.id}/policies/vulnerability_policy`,
        admin.accessToken,
        {
          name: "Vulnerability default",
          description: "Stays the default",
          type: "BLACKLIST",
          vulnerabilities: [],
          default: true,
        },
      );
      const other = await otherOrgAdmin();
      const otherDefault = await createPolicy(other, { default: true });

      const response = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `${base()}/${second}`,
        admin.accessToken,
        { default: true },
      );

      expect(response.statusCode).toBe(200);
      const defaults = (await listPolicies(admin))
        .filter((policy) => policy.default)
        .map((policy) => policy.id);
      expect(defaults).toEqual([second]);
      expect((await getPolicy(admin, first)).default).toBe(false);
      expect((await getPolicy(other, otherDefault)).default).toBe(true);
      const vulnerability = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${admin.organization.id}/policies/vulnerability_policy/${vulnerabilityDefault.json().id}`,
        admin.accessToken,
      );
      expect(vulnerability.json().data.default).toBe(true);
    });

    it("returns 404 for a vulnerability policy id", async () => {
      const created = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${admin.organization.id}/policies/vulnerability_policy`,
        admin.accessToken,
        {
          name: "Vulnerability policy",
          description: "Not a license policy",
          type: "BLACKLIST",
          vulnerabilities: [],
          default: false,
        },
      );

      const response = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `${base()}/${created.json().id}`,
        admin.accessToken,
        { name: "Renamed policy" },
      );

      expect(response.statusCode).toBe(404);
      expect(response.json().error_code).toBe("EntityNotFound");
    });
  });

  describe.each(["PATCH", "DELETE"] as const)("%s", (method) => {
    const body = method === "PATCH" ? { name: "Renamed policy" } : undefined;

    it("by a member below admin returns 403", async () => {
      const id = await createPolicy(admin);
      const moderator = await testHelper.createTestUser({
        email: "moderator@license-policies.com",
        password: "ModeratorPassword123!",
        organization: admin.organization,
        role: MemberRole.MODERATOR,
      });

      const response = await testHelper.makeAuthenticatedRequest(
        method,
        `${base()}/${id}`,
        moderator.accessToken,
        body,
      );

      expect(response.statusCode).toBe(403);
      expect((await getPolicy(admin, id)).name).toBe("No copyleft");
    });

    it("with a policy of another organization returns 404 and changes nothing", async () => {
      const other = await otherOrgAdmin();
      const foreign = await createPolicy(other);

      const response = await testHelper.makeAuthenticatedRequest(
        method,
        `${base()}/${foreign}`,
        admin.accessToken,
        body,
      );

      expect(response.statusCode).toBe(404);
      expect(response.json().error_code).toBe("EntityNotFound");
      expect((await getPolicy(other, foreign)).name).toBe("No copyleft");
    });
  });

  describe("DELETE", () => {
    it("removes the policy", async () => {
      const id = await createPolicy(admin);

      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `${base()}/${id}`,
        admin.accessToken,
      );

      expect(response.statusCode).toBe(200);
      const after = await testHelper.makeAuthenticatedRequest(
        "GET",
        `${base()}/${id}`,
        admin.accessToken,
      );
      expect(after.statusCode).toBe(404);
      expect(await listPolicies(admin)).toEqual([]);
    });

    it("keeps the results of an analysis that used the policy", async () => {
      // Deployed schemas lack the cascade on the policy join keys.
      await useDeployedPolicyJoinKeys();
      const projectId = await createProject(admin, "policy-project");
      const analysisId = await createAnalysisWithPolicies(admin, projectId);
      const [policy] = await listPolicies(admin);

      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `${base()}/${policy!.id}`,
        admin.accessToken,
      );

      expect(response.statusCode).toBe(200);
      const analysis = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${admin.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        admin.accessToken,
      );
      expect(analysis.statusCode).toBe(200);
      const results = await testHelper
        .getDataSource()
        .query(`SELECT count(*) n FROM result WHERE "analysisId" = $1`, [
          analysisId,
        ]);
      expect(Number(results[0].n)).toBe(1);
    });
  });

  it("the list shows the same creator as the single GET", async () => {
    const id = await createPolicy(admin);

    const [listed] = await listPolicies(admin);

    expect(listed!.created_by).toBe("admin@license-policies.com");
    expect(listed!.created_by).toBe((await getPolicy(admin, id)).created_by);
  });
});

// Recreates the policy join keys without ON DELETE CASCADE.
async function useDeployedPolicyJoinKeys(): Promise<void> {
  const db = testHelper.getDataSource();
  const keys = [
    ["organization_policies_policy", "policyId"],
    ["policy_analyses_analysis", "policyId"],
  ];
  for (const [table, column] of keys) {
    const rows: { conname: string }[] = await db.query(
      `SELECT conname FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND a.attname = $2`,
      [table, column],
    );
    for (const { conname } of rows) {
      await db.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${conname}"`);
      await db.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${conname}" FOREIGN KEY ("${column}") REFERENCES policy(id)`,
      );
    }
  }
}
