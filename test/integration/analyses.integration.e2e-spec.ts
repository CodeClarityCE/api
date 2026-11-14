import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Analyses Integration (e2e)", () => {
  let adminUser: TestUser;
  let regularUser: TestUser;
  let projectId: string;
  let analyzerId: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();

    // Create test users
    adminUser = await testHelper.createTestUser({
      email: "admin@analyses.com",
      password: "AdminPassword123!",
      firstName: "Admin",
      lastName: "User",
      orgName: "Analysis Organization",
      role: MemberRole.ADMIN,
    });

    regularUser = await testHelper.createTestUser({
      email: "user@analyses.com",
      password: "UserPassword123!",
      firstName: "Regular",
      lastName: "User",
      organization: adminUser.organization,
      role: MemberRole.USER,
    });

    // Create a test project
    const projectResponse = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${adminUser.organization.id}/projects`,
      adminUser.accessToken,
      {
        name: "Analysis Test Project",
        description: "Project for analysis testing",
      },
    );
    projectId = projectResponse.json().id;

    // Create a test analyzer
    const analyzerResponse = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${adminUser.organization.id}/analyzers`,
      adminUser.accessToken,
      {
        name: "Test Analyzer",
        description: "Analyzer for testing",
        steps: [
          [
            {
              name: "js-sbom",
              version: "1.0.0",
              config: {
                option1: { required: false, default: "value1" },
              },
              persistant_config: {},
            },
          ],
        ],
      },
    );
    analyzerId = analyzerResponse.json().id;
  });

  describe("POST /org/:orgId/projects/:projectId/analyses", () => {
    const analysisData = {
      analyzer_id: "",
      tag: "v1.0.0",
      branch: "main",
      config: {
        "js-sbom": {
          option1: "custom-value",
        },
      },
    };

    beforeEach(() => {
      analysisData.analyzer_id = analyzerId;
    });

    it("should create analysis as admin user", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
        analysisData,
      );

      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        status_code: 201,
        status: "success",
        id: expect.any(String),
      });
    });

    it("should create analysis as regular user", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${regularUser.organization.id}/projects/${projectId}/analyses`,
        regularUser.accessToken,
        analysisData,
      );

      // Assert
      expect(response.statusCode).toBe(201);
    });

    it("should validate required analyzer_id", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
        { ...analysisData, analyzer_id: "" },
      );

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it("should validate analyzer configuration", async () => {
      // Create analyzer with required config
      const strictAnalyzerResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/analyzers`,
        adminUser.accessToken,
        {
          name: "Strict Analyzer",
          description: "Analyzer with required config",
          steps: [
            [
              {
                name: "strict-step",
                version: "1.0.0",
                config: {
                  required_option: { required: true },
                },
                persistant_config: {},
              },
            ],
          ],
        },
      );
      const strictAnalyzerId = strictAnalyzerResponse.json().id;

      // Act - Missing required config
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
        {
          ...analysisData,
          analyzer_id: strictAnalyzerId,
          config: {}, // Missing required config
        },
      );

      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("AnaylzerMissingConfigAttribute");
    });

    it("should refuse an analysis for a project outside the organization", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/00000000-0000-4000-8000-000000000000/analyses`,
        adminUser.accessToken,
        analysisData,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });

    it("should reject unauthenticated requests", async () => {
      // Act
      const response = await testHelper.makeRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        analysisData,
      );

      // Assert
      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /org/:orgId/projects/:projectId/analyses", () => {
    let analysisIds: string[] = [];

    beforeEach(async () => {
      // Create multiple test analyses
      const analysisPromises = Array(3)
        .fill(null)
        .map((_, index) =>
          testHelper.makeAuthenticatedRequest(
            "POST",
            `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
            adminUser.accessToken,
            {
              analyzer_id: analyzerId,
              tag: `v1.${index}.0`,
              branch: "main",
              config: {},
            },
          ),
        );

      const responses = await Promise.all(analysisPromises);
      analysisIds = responses.map((r) => r.json().id);
    });

    it("should retrieve analyses for project members", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        regularUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(3);
      expect(body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: analysisIds[0] }),
          expect.objectContaining({ id: analysisIds[1] }),
          expect.objectContaining({ id: analysisIds[2] }),
        ]),
      );
      expect(body.page).toBe(0);
      expect(body.matching_count).toBe(3);
    });

    it("should support pagination", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses?page=0&entries_per_page=2`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.entries_per_page).toBe(2);
      expect(body.total_entries).toBe(3);
      expect(body.total_pages).toBe(2);
    });

    it("should refuse a project outside the organization", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/00000000-0000-4000-8000-000000000000/analyses`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });
  });

  describe("GET /org/:orgId/projects/:projectId/analyses/:analysisId", () => {
    let analysisId: string;

    beforeEach(async () => {
      // Create a test analysis
      const createResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
        {
          analyzer_id: analyzerId,
          tag: "v1.0.0",
          branch: "main",
          config: {},
        },
      );
      analysisId = createResponse.json().id;
    });

    it("should retrieve analysis details for authorized users", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        regularUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(
        expect.objectContaining({
          id: analysisId,
          branch: "main",
          status: expect.any(String),
        }),
      );
    });
    it("should return the analysis tag", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        adminUser.accessToken,
      );

      expect(response.json().data.tag).toBe("v1.0.0");
    });

    it("should refuse an analysis outside the project", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/00000000-0000-4000-8000-000000000000`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });
  });

  describe("GET /org/:orgId/projects/:projectId/analyses/:analysisId/chart", () => {
    let analysisId: string;

    beforeEach(async () => {
      // Create a test analysis
      const createResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
        {
          analyzer_id: analyzerId,
          tag: "v1.0.0",
          branch: "main",
          config: {},
        },
      );
      analysisId = createResponse.json().id;
    });

    it("should retrieve chart data for analysis", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}/chart`,
        regularUser.accessToken,
      );

      // Assert
      // A new analysis has no plugin results to chart yet.
      expect(response.statusCode).toBe(500);
      expect(response.json().error_code).toBe("PluginResultNotAvailable");
    });
  });

  describe("DELETE /org/:orgId/projects/:projectId/analyses/:analysisId", () => {
    let analysisId: string;

    beforeEach(async () => {
      // Create a test analysis
      const createResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
        {
          analyzer_id: analyzerId,
          tag: "v1.0.0",
          branch: "main",
          config: {},
        },
      );
      analysisId = createResponse.json().id;
    });

    it("should delete analysis as admin user", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status_code: 200, status: "success" });

      // Verify analysis is deleted
      const getResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        adminUser.accessToken,
      );
      expect(getResponse.statusCode).toBe(403);
    });

    it("should refuse to delete an analysis outside the project", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/00000000-0000-4000-8000-000000000000`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });
  });

  describe("Analysis Workflow Integration", () => {
    it("should complete full analysis lifecycle", async () => {
      // 1. Create analysis
      const createResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
        {
          analyzer_id: analyzerId,
          tag: "v2.0.0",
          branch: "develop",
          config: {},
        },
      );
      expect(createResponse.statusCode).toBe(201);
      const analysisId = createResponse.json().id;

      // 2. Retrieve analysis details
      const getResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        adminUser.accessToken,
      );
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json().data.id).toBe(analysisId);

      // 3. List analyses (should include our new analysis)
      const listResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
      );
      expect(listResponse.statusCode).toBe(200);
      const analyses = listResponse.json().data;
      expect(analyses.some((a: any) => a.id === analysisId)).toBe(true);

      // 4. Delete analysis
      const deleteResponse = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        adminUser.accessToken,
      );
      expect(deleteResponse.statusCode).toBe(200);

      // 5. Verify deletion
      const verifyResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        adminUser.accessToken,
      );
      expect(verifyResponse.statusCode).toBe(403);
    });

    it("should handle multiple concurrent analyses", async () => {
      // Create multiple analyses concurrently
      const analysisPromises = Array(3)
        .fill(null)
        .map((_, index) =>
          testHelper.makeAuthenticatedRequest(
            "POST",
            `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
            adminUser.accessToken,
            {
              analyzer_id: analyzerId,
              tag: `v3.${index}.0`,
              branch: "main",
              config: {},
            },
          ),
        );

      const responses = await Promise.all(analysisPromises);

      // All should succeed
      responses.forEach((response) => {
        expect(response.statusCode).toBe(201);
      });

      // Verify all analyses exist
      const listResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}/analyses`,
        adminUser.accessToken,
      );
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data).toHaveLength(3);
    });
  });
});
