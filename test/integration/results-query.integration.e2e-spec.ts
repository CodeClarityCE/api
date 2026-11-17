import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import {
  createAnalysisWithPolicies,
  createProject,
} from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("GET /result query params (e2e)", () => {
  let owner: TestUser;
  let params: Record<string, string>;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@results.com",
      role: MemberRole.OWNER,
    });
    const projectId = await createProject(owner, "results-project");
    const analysisId = await createAnalysisWithPolicies(owner, projectId);
    params = {
      org_id: owner.organization.id,
      project_id: projectId,
      analysis_id: analysisId,
      type: "js-sbom",
    };
  });

  function getResult(query: Record<string, string>): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "GET",
      `/result?${new URLSearchParams(query).toString()}`,
      owner.accessToken,
    );
  }

  it("returns the result when all four params are valid", async () => {
    const response = await getResult(params);

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(
      expect.objectContaining({ plugin: "js-sbom" }),
    );
  });

  it("answers ValidationFailed with no params", async () => {
    const response = await getResult({});

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("ValidationFailed");
  });

  it.each(["org_id", "project_id", "analysis_id", "type"])(
    "answers ValidationFailed without %s",
    async (missing) => {
      const { [missing]: _dropped, ...rest } = params;

      const response = await getResult(rest);

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("ValidationFailed");
    },
  );

  it("answers ValidationFailed for an id that is not a UUID", async () => {
    const response = await getResult({ ...params, org_id: "not-a-uuid" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("ValidationFailed");
  });
});
