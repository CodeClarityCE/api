import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Projects Integration (e2e)", () => {
  let adminUser: TestUser;
  let regularUser: TestUser;
  let otherOrgUser: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();

    // Create test users with different roles
    adminUser = await testHelper.createTestUser({
      email: "admin@projects.com",
      password: "AdminPassword123!",
      firstName: "Admin",
      lastName: "User",
      orgName: "Main Organization",
      role: MemberRole.ADMIN,
    });

    regularUser = await testHelper.createTestUser({
      email: "user@projects.com",
      password: "UserPassword123!",
      firstName: "Regular",
      lastName: "User",
      organization: adminUser.organization,
      role: MemberRole.USER,
    });

    otherOrgUser = await testHelper.createTestUser({
      email: "other@projects.com",
      password: "OtherPassword123!",
      firstName: "Other",
      lastName: "User",
      orgName: "Other Organization",
      role: MemberRole.ADMIN,
    });
  });

  describe("POST /org/:orgId/projects", () => {
    const projectData = {
      name: "Test Project",
      description: "A test project for integration testing",
    };

    it("should create project as admin user", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects`,
        adminUser.accessToken,
        projectData,
      );

      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        status_code: 201,
        status: "success",
        id: expect.any(String),
      });
    });

    it("should create project as regular user", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${regularUser.organization.id}/projects`,
        regularUser.accessToken,
        projectData,
      );

      // Assert
      expect(response.statusCode).toBe(201);
    });

    it("should reject project creation for different organization", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${otherOrgUser.organization.id}/projects`,
        adminUser.accessToken,
        projectData,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });
    it("should validate required fields", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects`,
        adminUser.accessToken,
        { name: "Test" }, // Missing required fields
      );

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it("should reject unauthenticated requests", async () => {
      // Act
      const response = await testHelper.makeRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects`,
        projectData,
      );

      // Assert
      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /org/:orgId/projects", () => {
    beforeEach(async () => {
      // Create some test projects
      const projects = [
        {
          name: "Project Alpha",
          description: "First project",
        },
        {
          name: "Project Beta",
          description: "Second project",
        },
        {
          name: "Project Gamma",
          description: "Third project",
        },
      ];

      for (const project of projects) {
        await testHelper.makeAuthenticatedRequest(
          "POST",
          `/org/${adminUser.organization.id}/projects`,
          adminUser.accessToken,
          project,
        );
      }
    });

    it("should retrieve projects for organization members", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects`,
        regularUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(3);
      expect(body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Project Alpha",
            description: "First project",
          }),
          expect.objectContaining({
            name: "Project Beta",
            description: "Second project",
          }),
          expect.objectContaining({
            name: "Project Gamma",
            description: "Third project",
          }),
        ]),
      );
      expect(body.page).toBe(0);
      expect(body.matching_count).toBe(3);
    });

    it("should support pagination", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects?page=0&entries_per_page=2`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.entries_per_page).toBe(2);
      expect(body.matching_count).toBe(3);
      expect(body.total_pages).toBe(2);
    });

    it("should support search functionality", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects?search_key=Alpha`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      const projects = response.json().data;
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("Project Alpha");
    });

    it("should reject requests from non-members", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects`,
        otherOrgUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
    });
  });

  describe("GET /org/:orgId/projects/:projectId", () => {
    let projectId: string;

    beforeEach(async () => {
      // Create a test project
      const createResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects`,
        adminUser.accessToken,
        {
          name: "Detailed Project",
          description: "Project for detailed view testing",
        },
      );
      projectId = createResponse.json().id;
    });

    it("should retrieve project details for organization members", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        regularUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(
        expect.objectContaining({
          id: projectId,
          name: "Detailed Project",
          description: "Project for detailed view testing",
          type: "FILE",
        }),
      );
    });

    it("should refuse a project outside the organization", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/00000000-0000-4000-8000-000000000000`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });

    it("should reject requests from non-members", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        otherOrgUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /org/:orgId/projects/:projectId", () => {
    let projectId: string;

    beforeEach(async () => {
      // Create a test project
      const createResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects`,
        adminUser.accessToken,
        {
          name: "Project to Delete",
          description: "This project will be deleted",
        },
      );
      projectId = createResponse.json().id;
    });

    it("should delete project as admin user", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status_code: 200, status: "success" });

      // Verify project is deleted
      const getResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        adminUser.accessToken,
      );
      expect(getResponse.statusCode).toBe(403);
    });

    it("should reject deletion by a regular user who did not add the project", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        regularUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });

    it("should refuse a project outside the organization", async () => {
      // Act
      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${adminUser.organization.id}/projects/00000000-0000-4000-8000-000000000000`,
        adminUser.accessToken,
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });
  });

  describe("Project Workflow Integration", () => {
    it("should complete full project lifecycle", async () => {
      // 1. Create project
      const createResponse = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${adminUser.organization.id}/projects`,
        adminUser.accessToken,
        {
          name: "Lifecycle Project",
          description: "Full lifecycle test",
        },
      );
      expect(createResponse.statusCode).toBe(201);
      const projectId = createResponse.json().id;

      // 2. Retrieve project details
      const getResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        adminUser.accessToken,
      );
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json().data.name).toBe("Lifecycle Project");

      // 3. List projects (should include our new project)
      const listResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects`,
        adminUser.accessToken,
      );
      expect(listResponse.statusCode).toBe(200);
      const projects = listResponse.json().data;
      expect(projects.some((p: any) => p.id === projectId)).toBe(true);

      // 4. Delete project
      const deleteResponse = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        adminUser.accessToken,
      );
      expect(deleteResponse.statusCode).toBe(200);

      // 5. Verify deletion
      const verifyResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects/${projectId}`,
        adminUser.accessToken,
      );
      expect(verifyResponse.statusCode).toBe(403);
    });

    it("should handle concurrent project operations", async () => {
      // Create multiple projects concurrently
      const projectPromises = Array(5)
        .fill(null)
        .map((_, index) =>
          testHelper.makeAuthenticatedRequest(
            "POST",
            `/org/${adminUser.organization.id}/projects`,
            adminUser.accessToken,
            {
              name: `Concurrent Project ${index}`,
              description: `Concurrent test ${index}`,
            },
          ),
        );

      const responses = await Promise.all(projectPromises);

      // All should succeed
      responses.forEach((response) => {
        expect(response.statusCode).toBe(201);
      });

      // Verify all projects exist
      const listResponse = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${adminUser.organization.id}/projects`,
        adminUser.accessToken,
      );
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data).toHaveLength(5);
    });
  });
});
