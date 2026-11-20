import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import {
  type StoredAnalysis,
  VulnerabilityInstanceWriter,
} from "../../src/codeclarity_modules/vulnerability_instances/vulnerability-instance-writer.service";
import { testHelper, type TestUser } from "../utils/integration-test-helper";
import { VulnerabilityInstanceFixtures } from "../utils/vulnerability-instance-fixtures";

interface ListRow {
  vulnerability_id: string;
  severity_class: string;
  severity_score: number;
  project_count: number;
  instance_count: number;
}

interface ListResponse {
  data: ListRow[];
  total_entries: number;
  severity_counts: Record<string, number>;
}

describe("Organization vulnerability list (e2e)", () => {
  let user: TestUser;
  let seed: VulnerabilityInstanceFixtures;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@org-vulns.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  const list = async (query = ""): Promise<ListResponse> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/vulnerabilities?entries_per_page=100${query}`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json() as ListResponse;
  };
  const counts = (response: ListResponse) =>
    response.data.map((row) => ({
      id: row.vulnerability_id,
      projects: row.project_count,
      instances: row.instance_count,
    }));

  it("lists each canonical vulnerability of the current analyses with its project and instance counts", async () => {
    const api = await seed.project("api");
    const web = await seed.project("web");
    const upload = await seed.project("upload", "");
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          findings: [
            { id: "CVE-2024-0001", dependency: "lodash", score: 9.8 },
            { id: "CVE-2024-0002", dependency: "minimist", score: 7.5 },
            { id: "CVE-2024-0002", dependency: "qs", score: 7.5 },
          ],
        },
      },
    });
    // An alias that names the CVE, in two workspaces of one project.
    const ghsa = {
      id: "GHSA-aaaa-bbbb-cccc",
      dependency: "lodash",
      score: 9.8,
      osvAliases: ["CVE-2024-0001"],
    };
    await seed.analysis({
      projectId: web,
      workspaces: {
        ".": { findings: [ghsa] },
        "packages/app": { findings: [ghsa] },
      },
    });
    // An upload has no default branch, so any label counts.
    await seed.analysis({
      projectId: upload,
      branch: "v1.2",
      workspaces: {
        ".": {
          findings: [{ id: "CVE-2024-0002", dependency: "qs", score: 7.5 }],
        },
      },
    });
    await seed.store();

    const response = await list();

    expect(counts(response)).toEqual([
      { id: "CVE-2024-0001", projects: 2, instances: 3 },
      { id: "CVE-2024-0002", projects: 2, instances: 3 },
    ]);
    expect(response.data[0]).toMatchObject({
      severity_class: "CRITICAL",
      severity_score: 9.8,
    });
    expect(response.total_entries).toBe(2);
    expect(response.severity_counts).toEqual({
      CRITICAL: 3,
      HIGH: 3,
      MEDIUM: 0,
      LOW: 0,
      NONE: 0,
    });
  });

  it("counts only each project's latest successful analysis of its default branch", async () => {
    const api = await seed.project("api");
    const only = (id: string) => ({
      ".": { findings: [{ id, dependency: "lodash" }] },
    });
    await seed.analysis({
      projectId: api,
      age: "3 days",
      workspaces: only("CVE-2020-0001"),
    });
    await seed.analysis({
      projectId: api,
      age: "2 days",
      workspaces: only("CVE-2024-0001"),
    });
    await seed.analysis({
      projectId: api,
      age: "1 day",
      status: "failure",
      workspaces: only("CVE-2024-9998"),
    });
    await seed.analysis({
      projectId: api,
      branch: "feature",
      workspaces: only("CVE-2024-9999"),
    });
    await seed.store();

    expect(counts(await list())).toEqual([
      { id: "CVE-2024-0001", projects: 1, instances: 1 },
    ]);
  });

  it("keeps showing the previous analysis until a new one's instances are stored", async () => {
    const api = await seed.project("api");
    await seed.analysis({
      projectId: api,
      age: "1 day",
      workspaces: {
        ".": { findings: [{ id: "CVE-2024-0001", dependency: "lodash" }] },
      },
    });
    await seed.store();
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": { findings: [{ id: "CVE-2024-0002", dependency: "lodash" }] },
      },
    });

    expect(counts(await list()).map((row) => row.id)).toEqual([
      "CVE-2024-0001",
    ]);

    await seed.store();
    await seed.store();

    expect(counts(await list())).toEqual([
      { id: "CVE-2024-0002", projects: 1, instances: 1 },
    ]);
  });

  it("drops an analysis's instances when the analysis is deleted", async () => {
    const api = await seed.project("api");
    const web = await seed.project("web");
    const finding = {
      ".": { findings: [{ id: "CVE-2024-0001", dependency: "lodash" }] },
    };
    await seed.analysis({ projectId: api, workspaces: finding });
    const webAnalysis = await seed.analysis({
      projectId: web,
      workspaces: finding,
    });
    await seed.store();

    const deleted = await testHelper.makeAuthenticatedRequest(
      "DELETE",
      `/org/${user.organization.id}/projects/${web}/analyses/${webAnalysis}`,
      user.accessToken,
    );
    expect(deleted.statusCode).toBe(200);

    expect(counts(await list())).toEqual([
      { id: "CVE-2024-0001", projects: 1, instances: 1 },
    ]);
  });

  it("classes scores like the results pages", async () => {
    const api = await seed.project("api");
    const scores = [0, 0.1, 3.9, 4.0, 6.9, 7.0, 8.9, 9.0, 10];
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          findings: scores.map((score, i) => ({
            id: `TEST-${i}`,
            dependency: "lodash",
            score,
          })),
        },
      },
    });
    await seed.store();

    const classes = Object.fromEntries(
      (await list()).data.map((row) => [
        row.vulnerability_id,
        row.severity_class,
      ]),
    );

    expect(scores.map((_, i) => classes[`TEST-${i}`])).toEqual([
      "NONE",
      "LOW",
      "LOW",
      "MEDIUM",
      "MEDIUM",
      "HIGH",
      "HIGH",
      "CRITICAL",
      "CRITICAL",
    ]);
  });

  it("leaves out instances hidden by default", async () => {
    const api = await seed.project("api");
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          findings: [
            {
              id: "CVE-2024-0001",
              dependency: "lodash",
              verdicts: [
                { source: "gcve", verdict: "matched" },
                { source: "osv", verdict: "version_excluded" },
                { source: "nvd", verdict: "no_record" },
              ],
            },
            { id: "CVE-2024-0002", dependency: "qs" },
          ],
        },
      },
    });
    await seed.store();

    expect(counts(await list()).map((row) => row.id)).toEqual([
      "CVE-2024-0002",
    ]);
  });

  it("tells listeners about each stored analysis once, and retries one whose listener failed", async () => {
    const api = await seed.project("api");
    const finding = {
      ".": { findings: [{ id: "CVE-2024-0001", dependency: "lodash" }] },
    };
    const analysisId = await seed.analysis({
      projectId: api,
      workspaces: finding,
    });
    const seen: StoredAnalysis[] = [];
    let fail = true;
    testHelper
      .getApp()
      .get(VulnerabilityInstanceWriter)
      .onInstancesStored(async (analysis) => {
        if (fail) throw new Error("listener down");
        seen.push(analysis);
      });

    await seed.store();
    expect((await list()).data).toEqual([]);

    fail = false;
    await seed.store();
    await seed.store();

    expect(seen).toEqual([
      {
        analysisId,
        projectId: api,
        organizationId: user.organization.id,
        ref: "main",
      },
    ]);
    expect(counts(await list())).toEqual([
      { id: "CVE-2024-0001", projects: 1, instances: 1 },
    ]);
  });

  it("pages the list", async () => {
    const api = await seed.project("api");
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          findings: [
            { id: "CVE-2024-0001", dependency: "a", score: 9 },
            { id: "CVE-2024-0002", dependency: "b", score: 8 },
            { id: "CVE-2024-0003", dependency: "c", score: 7 },
          ],
        },
      },
    });
    await seed.store();

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/vulnerabilities?entries_per_page=2&page=1`,
      user.accessToken,
    );

    expect(response.json()).toMatchObject({
      data: [{ vulnerability_id: "CVE-2024-0003" }],
      page: 1,
      entries_per_page: 2,
      total_entries: 3,
      total_pages: 2,
    });
  });

  it("refuses users outside the organization", async () => {
    const outsider = await testHelper.createTestUser({
      email: "outsider@org-vulns.com",
      orgName: "Other org",
    });

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/vulnerabilities`,
      outsider.accessToken,
    );

    expect(response.statusCode).toBe(403);
  });

  it("no longer serves the old recent vulnerabilities list", async () => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/dashboard/recent_vulns`,
      user.accessToken,
    );

    expect(response.statusCode).toBe(404);
  });
});
