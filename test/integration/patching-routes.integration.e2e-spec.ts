import { randomUUID } from "crypto";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const workspace = {
  patches: {
    "lodash@4.17.20": {
      IsPatchable: "FULL",
      Patchable: [],
      Unpatchable: [],
      Introduced: [],
    },
  },
  dev_patches: {},
};

describe("Patching routes (e2e)", () => {
  let user: TestUser;
  let orgId: string;
  let base: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@patching-routes.com",
      role: MemberRole.ADMIN,
    });
    orgId = user.organization.id;
    const project = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/projects`,
      user.accessToken,
      { name: "Patched project", description: "Has patches" },
    );
    const projectId = project.json().id as string;

    const data = testHelper.getDataSource();
    const analysisId = randomUUID();
    await data.query(
      `INSERT INTO analysis (id, created_on, config, status, steps, branch, "projectId", "organizationId")
       VALUES ($1, now(), '{}', 'completed', '[]', 'main', $2, $3)`,
      [analysisId, projectId, orgId],
    );
    await data.query(
      `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, 'js-patching', now(), $2)`,
      [
        JSON.stringify({
          workspaces: { ".": workspace },
          analysis_info: { status: "success" },
        }),
        analysisId,
      ],
    );
    base = `/org/${orgId}/projects/${projectId}/analysis/${analysisId}`;
  });

  it("returns the whole workspace, whatever list parameters are sent", async () => {
    for (const query of [
      "workspace=.",
      "workspace=.&page=2&entries_per_page=1&sort_by=x&search_key=nothing",
    ]) {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `${base}/patching?${query}`,
        user.accessToken,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(workspace);
    }
  });

  it("no longer serves the dependency patch policy routes", async () => {
    for (const [method, path] of [
      ["GET", `/org/${orgId}/policies/dependency_patch`],
      ["POST", `/org/${orgId}/policies/dependency_patch`],
    ] as const) {
      const response = await testHelper.makeAuthenticatedRequest(
        method,
        path,
        user.accessToken,
        method === "POST" ? { name: "x" } : undefined,
      );
      expect([method, response.statusCode]).toEqual([method, 404]);
    }
  });
});
