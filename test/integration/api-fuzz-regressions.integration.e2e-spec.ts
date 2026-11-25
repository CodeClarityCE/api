import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { createProject } from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// Requests the nightly API fuzz run (scripts/api-fuzz) found answering 5xx or breaking the
// OpenAPI schema, replayed once fixed.
describe("API fuzz regressions (e2e)", () => {
  let owner: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@fuzz.com",
      role: MemberRole.OWNER,
    });
  });

  async function get(path: string): Promise<{
    statusCode: number;
    body: { error_code?: string };
  }> {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      path,
      owner.accessToken,
    );
    return {
      statusCode: response.statusCode,
      body: response.json() as { error_code?: string },
    };
  }

  describe("an id that is not a UUID", () => {
    it.each([
      "/org/0",
      "/org/0/meta_data",
      "/org/0/members?page=0&entries_per_page=0",
      "/org/0/invitations?page=0&entries_per_page=0",
      "/org/0/audit_logs?page=0&entries_per_page=0",
    ])("GET %s is refused as a bad request", async (path) => {
      const response = await get(path);

      expect(response.statusCode).toBe(400);
      expect(response.body.error_code).toBe("BadRequest");
    });
  });

  it("GET /org with a page past the database's integer range is refused as a bad request", async () => {
    const response = await get(
      "/org?page=9223372036854775808&entries_per_page=0",
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.error_code).toBe("BadRequest");
  });

  it("GET /analyzer-templates/:language for a language without a template is not found", async () => {
    const response = await get("/analyzer-templates/0");

    expect(response.statusCode).toBe(404);
    expect(response.body.error_code).toBe("EntityNotFound");
  });

  it("GET /plugin/:plugin_id for an unknown plugin is not found", async () => {
    const response = await get("/plugin/33dc3736-4411-4474-874a-f6ea51acf19f");

    expect(response.statusCode).toBe(404);
    expect(response.body.error_code).toBe("EntityNotFound");
  });

  it.each([
    "/knowledge/vulnerabilities/search?query=&page=0&limit=0",
    "/knowledge/vulnerabilities/search?page=0&limit=0&source=NVD",
    "/knowledge/vulnerabilities/search?query=a&query=b",
  ])("GET %s without one query is refused as a bad request", async (path) => {
    const response = await get(path);

    expect(response.statusCode).toBe(400);
    expect(response.body.error_code).toBe("BadRequest");
  });

  async function send(
    method: "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<{ statusCode: number; body: { error_code?: string } }> {
    const response = await testHelper.makeAuthenticatedRequest(
      method,
      path,
      owner.accessToken,
      body,
    );
    return {
      statusCode: response.statusCode,
      body: response.json() as { error_code?: string },
    };
  }

  describe("a NUL character in a value sent to the database", () => {
    it.each(["/projects?search_key=%00", "/tickets?status=%00"])(
      "GET /org/:org%s is refused as a bad request",
      async (path) => {
        const response = await get(`/org/${owner.organization.id}${path}`);

        expect(response.statusCode).toBe(400);
        expect(response.body.error_code).toBe("BadRequest");
      },
    );

    it.each([
      ["/auth/confirm_registration", { token: "t", user_id_hash: "\u0000" }],
      ["/users/confirm_registration", { token: "t", user_id_hash: "\u0000" }],
      [
        "/knowledge/packages/check-outdated",
        {
          packages: [
            { name: "a\u0000", currentVersion: "1", ecosystem: "npm" },
          ],
        },
      ],
      [
        "/knowledge/packages/check-vulnerabilities",
        { packages: [{ name: "a\u0000", version: "1", ecosystem: "npm" }] },
      ],
    ])("POST %s is refused as a bad request", async (path, body) => {
      const response = await send("POST", path, body);

      expect(response.statusCode).toBe(400);
      expect(response.body.error_code).toBe("BadRequest");
    });

    it("POST /org/:org/join is refused as a bad request", async () => {
      const response = await send(
        "POST",
        `/org/${owner.organization.id}/join`,
        {
          token: "t",
          email_digest: "\u0000",
        },
      );

      expect(response.statusCode).toBe(400);
      expect(response.body.error_code).toBe("BadRequest");
    });

    it("PATCH /users/:user_id/update_default_org is refused as a bad request", async () => {
      const response = await send(
        "PATCH",
        `/users/${owner.user.id}/update_default_org`,
        { default_org: "\u0000" },
      );

      expect(response.statusCode).toBe(400);
      expect(response.body.error_code).toBe("BadRequest");
    });
  });

  describe("a ticket request without a body", () => {
    it.each([
      "/tickets/bulk-sync/JIRA",
      "/tickets/bulk-sync-from-external",
      "/tickets/integrations/clickup/oauth/callback",
      "/tickets/integrations/JIRA/workspaces/0/spaces",
      "/tickets/integrations/JIRA/spaces/0/folders",
      "/tickets/integrations/CLICKUP/spaces/0/lists",
      "/tickets/integrations/CLICKUP/folders/0/lists",
    ])("POST /org/:org%s is refused as malformed", async (path) => {
      const response = await send(
        "POST",
        `/org/${owner.organization.id}${path}`,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body.error_code).toBe("ValidationFailed");
    });
  });

  describe("GET /org/:org/file/:project/:file_name", () => {
    it("is not found for a file that does not exist", async () => {
      const projectId = await createProject(owner, "fuzz-project");

      const response = await get(
        `/org/${owner.organization.id}/file/${projectId}/0`,
      );

      expect(response.statusCode).toBe(404);
      expect(response.body.error_code).toBe("EntityNotFound");
    });

    it("is not found for a name that is only dots", async () => {
      const projectId = await createProject(owner, "fuzz-project");

      const response = await get(
        `/org/${owner.organization.id}/file/${projectId}/...`,
      );

      expect(response.statusCode).toBe(404);
    });

    it("refuses a user outside the organization", async () => {
      const projectId = await createProject(owner, "fuzz-project");
      const outsider = await testHelper.createTestUser({
        email: "outsider@fuzz.com",
        orgName: "Outsider Org",
      });

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${owner.organization.id}/file/${projectId}/0`,
        outsider.accessToken,
      );

      expect(response.statusCode).toBe(403);
    });
  });

  describe("User responses match the OpenAPI description", () => {
    interface PropertySchema {
      nullable?: boolean;
    }
    interface ObjectSchema {
      required?: string[];
      properties: Record<string, PropertySchema>;
    }

    // Names the fields of value that the schema's required list or nullability refuse.
    function schemaProblems(
      schemaName: string,
      value: Record<string, unknown>,
    ): string[] {
      const document = SwaggerModule.createDocument(
        testHelper.getApp(),
        new DocumentBuilder().build(),
      );
      const schema = document.components?.schemas?.[schemaName] as ObjectSchema;
      const missing = (schema.required ?? [])
        .filter((name) => !(name in value))
        .map((name) => `${name} missing`);
      const nulls = Object.entries(value)
        .filter(([, field]) => field === null)
        .filter(([name]) => schema.properties[name]?.nullable !== true)
        .map(([name]) => `${name} null`);
      return [...missing, ...nulls];
    }

    it("GET /auth/user", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      expect(schemaProblems("User", response.json().data)).toEqual([]);
    });

    it("GET /users/:user_id", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/users/${owner.user.id}`,
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      expect(schemaProblems("User", response.json().data)).toEqual([]);
    });
  });
});
