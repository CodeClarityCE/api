import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { auditEntries } from "../utils/audit-log";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const DAY = 86_400_000;

describe("Organization tokens (e2e)", () => {
  let admin: TestUser;
  let otherOrgAdmin: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    admin = await testHelper.createTestUser({
      email: "admin@tokens.com",
      orgName: "Token Org",
      role: MemberRole.ADMIN,
    });
    otherOrgAdmin = await testHelper.createTestUser({
      email: "other@tokens.com",
      orgName: "Other Org",
      role: MemberRole.ADMIN,
    });
  });

  function createProject(user: TestUser, name: string): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${user.organization.id}/projects`,
      user.accessToken,
      { name, description: "" },
    );
  }

  function createToken(
    user: TestUser = admin,
    body: object = {
      name: "ci-pipeline",
      scope: "analyze",
      expires_on: new Date(Date.now() + 30 * DAY).toISOString(),
    },
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${user.organization.id}/tokens`,
      user.accessToken,
      body,
    );
  }

  function listProjects(secret: string, orgId: string): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${orgId}/projects?entries_per_page=100`,
      secret,
    );
  }

  it("an admin creates a token and a request with it lists the organization's projects", async () => {
    await createProject(admin, "token-org-app");
    await createProject(otherOrgAdmin, "other-org-app");

    const created = await createToken();
    expect(created.statusCode).toBe(201);
    const token = created.json().data;
    expect(token).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "ci-pipeline",
        scope: "analyze",
        secret: expect.stringMatching(/^ccot_[A-Za-z0-9_-]{40,}$/),
      }),
    );

    const listed = await listProjects(token.secret, admin.organization.id);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data.map((p: { name: string }) => p.name)).toEqual([
      "token-org-app",
    ]);
  });

  it("a token cannot read another organization", async () => {
    const token = (await createToken()).json().data;

    const listed = await listProjects(
      token.secret,
      otherOrgAdmin.organization.id,
    );
    expect(listed.statusCode).toBe(403);
  });

  it("a token is refused on a route that does not allow tokens", async () => {
    const token = (await createToken()).json().data;

    const logs = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/audit_logs`,
      token.secret,
    );
    expect(logs.statusCode).toBe(403);
  });

  it("an unknown token is not authenticated", async () => {
    const token = (await createToken()).json().data;

    const listed = await listProjects(
      `${token.secret.slice(0, -4)}AAAA`,
      admin.organization.id,
    );
    expect(listed.statusCode).toBe(401);
  });

  it("the audit log names the token that made a request, and who created it", async () => {
    const token = (await createToken()).json().data;
    await listProjects(token.secret, admin.organization.id);

    expect(await auditEntries(admin, "OrganizationTokenUsed")).toEqual([
      expect.objectContaining({
        blame_on_token_id: token.id,
        blame_on_token_name: "ci-pipeline",
        blame_on_email: null,
        description: expect.stringContaining("GET /org/:org_id/projects"),
      }),
    ]);
    expect(await auditEntries(admin, "OrganizationTokenCreated")).toEqual([
      expect.objectContaining({
        blame_on_email: "admin@tokens.com",
        description: expect.stringContaining("ci-pipeline"),
      }),
    ]);
  });

  it("only a hash of the secret is stored", async () => {
    const token = (await createToken()).json().data;

    // Every row of every table, as text, so no column name is assumed.
    const source = testHelper.getDataSource();
    const tables: { tablename: string }[] = await source.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const rows: string[] = [];
    for (const { tablename } of tables) {
      const found: { row: string }[] = await source.query(
        `SELECT row_to_json(t)::text AS row FROM "${tablename}" t`,
      );
      rows.push(...found.map((r) => r.row));
    }
    expect(rows.join("\n")).toContain(token.id);
    expect(rows.join("\n")).not.toContain(token.secret.slice(5));
  });

  it("only an admin can create a token", async () => {
    const member = await testHelper.createTestUser({
      email: "member@tokens.com",
      organization: admin.organization,
      role: MemberRole.USER,
    });

    expect((await createToken(member)).statusCode).toBe(403);
  });

  it("an expired token is not authenticated", async () => {
    const token = (
      await createToken(admin, {
        name: "short-lived",
        scope: "read",
        expires_on: new Date(Date.now() + 1500).toISOString(),
      })
    ).json().data;
    expect(
      (await listProjects(token.secret, admin.organization.id)).statusCode,
    ).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(
      (await listProjects(token.secret, admin.organization.id)).statusCode,
    ).toBe(401);
  });
});
