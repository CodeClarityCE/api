import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { createProject } from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("POST /org/:orgId/projects/:projectId/analyses/:analysisId/execute (e2e)", () => {
  let owner: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let otherProjectId: string;
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
    outsider = await testHelper.createTestUser({
      email: "outsider@execute.com",
      orgName: "Outsider Org",
      role: MemberRole.ADMIN,
    });
    projectId = await createProject(owner, "Execute project");
    otherProjectId = await createProject(owner, "Other project");

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

  function execute(
    user: TestUser,
    orgId: string,
    project: string,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/projects/${project}/analyses/${analysisId}/execute`,
      user.accessToken,
    );
  }

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

  it("creates a new run for a member of the organization", async () => {
    const response = await execute(owner, owner.organization.id, projectId);

    expect(response.statusCode).toBe(201);
    expect(response.json().id).not.toBe(analysisId);
    expect(await analysisCount()).toBe(2);
  });

  it("refuses a user of another organization and creates no run", async () => {
    const response = await execute(outsider, owner.organization.id, projectId);

    expect(response.statusCode).toBe(403);
    expect(await analysisCount()).toBe(1);
  });

  it("refuses another organization's user calling through their own org id", async () => {
    const outsiderProject = await createProject(outsider, "Outsider project");
    const response = await execute(
      outsider,
      outsider.organization.id,
      outsiderProject,
    );

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(await analysisCount()).toBe(1);
  });

  it("refuses a project id the analysis does not belong to", async () => {
    const response = await execute(
      owner,
      owner.organization.id,
      otherProjectId,
    );

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(await analysisCount()).toBe(1);
  });
});
