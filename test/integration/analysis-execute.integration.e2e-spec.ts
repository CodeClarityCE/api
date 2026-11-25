import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { createProject } from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// The scheduler creates scheduled runs in the database (ADR 0022), so this route is gone.
describe("POST /org/:orgId/projects/:projectId/analyses/:analysisId/execute (e2e)", () => {
  let owner: TestUser;
  let projectId: string;
  let analysisId: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@execute.com",
      orgName: "Execute Org",
      role: MemberRole.ADMIN,
    });
    projectId = await createProject(owner, "Execute project");

    const analyzer = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${owner.organization.id}/analyzers`,
      owner.accessToken,
      {
        name: "Execute Analyzer",
        description: "Analyzer for execute tests",
        steps: [
          [
            {
              name: "js-sbom",
              version: "1.0.0",
              config: {},
              persistant_config: {},
            },
          ],
        ],
      },
    );
    const analysis = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${owner.organization.id}/projects/${projectId}/analyses`,
      owner.accessToken,
      { analyzer_id: analyzer.json().id, branch: "main", config: {} },
    );
    expect(analysis.statusCode).toBe(201);
    analysisId = analysis.json().id;
  });

  // Number of analyses the owner sees in the project.
  async function analysisCount(): Promise<number> {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${owner.organization.id}/projects/${projectId}/analyses`,
      owner.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json().matching_count;
  }

  it("is not found for a member of the organization and creates no run", async () => {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${owner.organization.id}/projects/${projectId}/analyses/${analysisId}/execute`,
      owner.accessToken,
    );

    expect(response.statusCode).toBe(404);
    expect(await analysisCount()).toBe(1);
  });

  it("is absent from the OpenAPI description", () => {
    const document = SwaggerModule.createDocument(
      testHelper.getApp(),
      new DocumentBuilder().build(),
    );

    expect(
      Object.keys(document.paths).filter((route) => route.endsWith("/execute")),
    ).toEqual([]);
  });
});
