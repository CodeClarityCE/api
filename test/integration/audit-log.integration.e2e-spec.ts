import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { auditEntries, readAuditLog } from "../utils/audit-log";
import {
  createAnalysisWithPolicies,
  createProject,
} from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Audit log (e2e)", () => {
  let admin: TestUser;
  let member: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    admin = await testHelper.createTestUser({
      email: "admin@audit.com",
      orgName: "Audit Org",
      role: MemberRole.ADMIN,
    });
    member = await testHelper.createTestUser({
      email: "member@audit.com",
      organization: admin.organization,
      role: MemberRole.USER,
    });
  });

  function request(
    user: TestUser,
    method: "POST" | "DELETE",
    url: string,
    body?: object,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      method,
      `/org/${admin.organization.id}${url}`,
      user.accessToken,
      body,
    );
  }

  describe("starting an analysis", () => {
    it("records who started it and on which project", async () => {
      const projectId = await createProject(admin, "widget");
      await createAnalysisWithPolicies(admin, projectId);

      expect(await auditEntries(admin, "AnalysisStarted")).toEqual([
        expect.objectContaining({
          action_class: "Analysis",
          action_severity: 0,
          blame_on_email: "admin@audit.com",
          description: expect.stringContaining("widget"),
        }),
      ]);
    });

    it("writes nothing for a scheduled analysis that does not run now", async () => {
      const projectId = await createProject(admin, "widget");
      const analyzer = await request(admin, "POST", "/analyzers", {
        name: "Nightly",
        description: "Analyzer for a scheduled run",
        steps: [[{ name: "js-sbom", version: "1.0.0", config: {} }]],
      });

      const response = await request(
        admin,
        "POST",
        `/projects/${projectId}/analyses`,
        {
          analyzer_id: analyzer.json().id,
          branch: "main",
          config: {},
          schedule_type: "daily",
          next_scheduled_run: new Date(Date.now() + 86_400_000).toISOString(),
        },
      );

      expect(response.statusCode).toBe(201);
      expect(await auditEntries(admin, "AnalysisStarted")).toEqual([]);
    });

    it("writes nothing when the start is refused", async () => {
      const projectId = await createProject(admin, "widget");
      const outsider = await testHelper.createTestUser({
        email: "outsider@audit.com",
        orgName: "Other Org",
      });

      const response = await request(
        outsider,
        "POST",
        `/projects/${projectId}/analyses`,
        { analyzer_id: crypto.randomUUID(), branch: "main", config: {} },
      );

      expect(response.statusCode).toBe(403);
      expect(await auditEntries(admin, "AnalysisStarted")).toEqual([]);
    });
  });

  describe("deleting an analysis", () => {
    it("records who deleted it and from which project", async () => {
      const projectId = await createProject(admin, "widget");
      const analysisId = await createAnalysisWithPolicies(admin, projectId);

      const response = await request(
        member,
        "DELETE",
        `/projects/${projectId}/analyses/${analysisId}`,
      );

      expect(response.statusCode).toBe(200);
      expect(await auditEntries(admin, "AnalysisDeleted")).toEqual([
        expect.objectContaining({
          action_class: "Analysis",
          action_severity: 2,
          blame_on_email: "member@audit.com",
          description: expect.stringContaining("widget"),
        }),
      ]);
    });

    it("records one entry for a batch delete", async () => {
      const projectId = await createProject(admin, "widget");
      const first = await createAnalysisWithPolicies(admin, projectId);
      const second = await createAnalysisWithPolicies(admin, projectId);

      const response = await request(
        member,
        "POST",
        `/projects/${projectId}/analyses/batch-delete`,
        { analysis_ids: [first, second] },
      );

      expect(response.statusCode).toBe(201);
      expect(await auditEntries(admin, "AnalysisDeleted")).toEqual([
        expect.objectContaining({
          action_severity: 2,
          blame_on_email: "member@audit.com",
          description: expect.stringMatching(/2 analyses.*widget/),
        }),
      ]);
    });

    it("writes nothing when the analysis does not exist", async () => {
      const projectId = await createProject(admin, "widget");

      const response = await request(
        member,
        "DELETE",
        `/projects/${projectId}/analyses/${crypto.randomUUID()}`,
      );

      expect(response.statusCode).toBe(404);
      expect(await auditEntries(admin, "AnalysisDeleted")).toEqual([]);
    });
  });

  describe("deleting an analyzer", () => {
    async function createAnalyzer(name: string): Promise<string> {
      const response = await request(admin, "POST", "/analyzers", {
        name,
        description: "Analyzer for audit log tests",
        steps: [[{ name: "js-sbom", version: "1.0.0", config: {} }]],
      });
      expect(response.statusCode).toBe(201);
      return response.json().id;
    }

    it("records who deleted it and its name", async () => {
      const analyzerId = await createAnalyzer("Doomed analyzer");

      const response = await request(
        admin,
        "DELETE",
        `/analyzers/${analyzerId}`,
      );

      expect(response.statusCode).toBe(200);
      expect(await auditEntries(admin, "AnalyzerDelete")).toEqual([
        expect.objectContaining({
          action_class: "Analyzer",
          action_severity: 2,
          blame_on_email: "admin@audit.com",
          description: expect.stringContaining("Doomed analyzer"),
        }),
      ]);
    });

    it("writes nothing when a member is not allowed to delete it", async () => {
      const analyzerId = await createAnalyzer("Kept analyzer");

      const response = await request(
        member,
        "DELETE",
        `/analyzers/${analyzerId}`,
      );

      expect(response.statusCode).toBe(403);
      expect(await auditEntries(admin, "AnalyzerDelete")).toEqual([]);
    });
  });

  describe("severity by impact", () => {
    it("ranks deletions above creates and starts", async () => {
      const projectId = await createProject(admin, "ranked");
      await createAnalysisWithPolicies(admin, projectId);

      const response = await request(admin, "DELETE", `/projects/${projectId}`);
      expect(response.statusCode).toBe(200);

      const severities = Object.fromEntries(
        (await readAuditLog(admin)).map((e) => [e.action, e.action_severity]),
      );
      expect(severities).toEqual({
        ProjectCreate: 0,
        AnalyzerCreate: 0,
        AnalysisStarted: 0,
        ProjectDelete: 2,
      });
    });
  });

  describe("reading the audit log", () => {
    it("lists newest first and filters by search key", async () => {
      await createProject(admin, "alpha");
      const betaId = await createProject(admin, "beta");
      await createAnalysisWithPolicies(admin, betaId);

      const all = await readAuditLog(admin);
      expect(all.map((e) => e.action)).toEqual([
        "AnalysisStarted",
        "AnalyzerCreate",
        "ProjectCreate",
        "ProjectCreate",
      ]);

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${admin.organization.id}/audit_logs?search_key=analysis`,
        admin.accessToken,
      );
      expect(
        response.json().data.map((e: { action: string }) => e.action),
      ).toEqual(["AnalysisStarted"]);
    });

    it("is refused to members who are not admins", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${admin.organization.id}/audit_logs`,
        member.accessToken,
      );

      expect(response.statusCode).toBe(403);
    });
  });
});
