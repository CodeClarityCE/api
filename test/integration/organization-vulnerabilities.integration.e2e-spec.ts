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
  uncorroborated_count: number;
}

interface ListResponse {
  data: ListRow[];
  total_entries: number;
  severity_counts: Record<string, number>;
  hidden_counts: Record<string, number>;
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

  describe("hidden instances", () => {
    const contradicted = [
      { source: "gcve", verdict: "matched" },
      { source: "osv", verdict: "version_excluded" },
      { source: "nvd", verdict: "no_record" },
    ];
    const retired = [
      { source: "osv", verdict: "retired" },
      { source: "nvd", verdict: "retired" },
    ];
    // One shown, one contradicted, one retired everywhere, one excluded by policy
    // and one both contradicted and excluded.
    const seedHidden = async (): Promise<string> => {
      const api = await seed.project("api");
      await seed.analysis({
        projectId: api,
        policyExcludes: ["CVE-2024-0004", "CVE-2024-0005"],
        workspaces: {
          ".": {
            findings: [
              { id: "CVE-2024-0001", dependency: "qs", score: 9.8 },
              {
                id: "CVE-2024-0002",
                dependency: "lodash",
                score: 7.5,
                verdicts: contradicted,
              },
              {
                id: "CVE-2024-0003",
                dependency: "minimist",
                score: 7.5,
                verdicts: retired,
              },
              { id: "CVE-2024-0004", dependency: "express", score: 7.5 },
              {
                id: "CVE-2024-0005",
                dependency: "debug",
                score: 5.3,
                verdicts: contradicted,
              },
            ],
          },
        },
      });
      await seed.store();
      return api;
    };
    const ids = (response: ListResponse): string[] =>
      response.data.map((row) => row.vulnerability_id);

    it("leaves out contradicted, retired and policy-excluded instances and counts them per reason", async () => {
      await seedHidden();

      const response = await list();

      expect(ids(response)).toEqual(["CVE-2024-0001"]);
      expect(response.hidden_counts).toEqual({
        contradicted: 2,
        retired_all: 1,
        excluded_by_policy: 2,
      });
      expect(response.severity_counts).toMatchObject({ CRITICAL: 1, HIGH: 0 });
    });

    it("shows the instances hidden for the reasons asked for, still counting them", async () => {
      await seedHidden();

      const contradictedOnly = await list("&show=contradicted");
      const both = await list("&show=contradicted,excluded_by_policy");

      // CVE-2024-0005 stays hidden until its policy exclusion is shown too.
      expect(ids(contradictedOnly)).toEqual(["CVE-2024-0001", "CVE-2024-0002"]);
      expect(contradictedOnly.severity_counts).toMatchObject({
        CRITICAL: 1,
        HIGH: 1,
      });
      expect(ids(both)).toEqual([
        "CVE-2024-0001",
        "CVE-2024-0002",
        "CVE-2024-0004",
        "CVE-2024-0005",
      ]);
      expect(both.hidden_counts).toEqual({
        contradicted: 2,
        retired_all: 1,
        excluded_by_policy: 2,
      });
    });

    it("counts only the hidden instances the other filters keep", async () => {
      await seedHidden();

      const response = await list("&severity=HIGH");

      expect(response.data).toEqual([]);
      expect(response.hidden_counts).toEqual({
        contradicted: 1,
        retired_all: 1,
        excluded_by_policy: 1,
      });
    });

    it("refuses an unknown reason to show", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${user.organization.id}/vulnerabilities?show=everything`,
        user.accessToken,
      );

      expect(response.statusCode).toBe(400);
    });
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

  it("keeps uncorroborated instances and counts them on their vulnerability", async () => {
    const api = await seed.project("api");
    const web = await seed.project("web");
    const oneOrigin = [
      { source: "osv", verdict: "matched" },
      { source: "nvd", verdict: "no_record" },
    ];
    const twoOrigins = [
      { source: "osv", verdict: "matched" },
      { source: "nvd", verdict: "matched" },
    ];
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          findings: [
            {
              id: "CVE-2024-0001",
              dependency: "lodash",
              score: 9.8,
              verdicts: oneOrigin,
            },
            {
              id: "CVE-2024-0002",
              dependency: "qs",
              score: 7.5,
              verdicts: twoOrigins,
            },
          ],
        },
      },
    });
    await seed.analysis({
      projectId: web,
      workspaces: {
        ".": {
          findings: [
            {
              id: "CVE-2024-0001",
              dependency: "lodash",
              score: 9.8,
              verdicts: twoOrigins,
            },
          ],
        },
      },
    });
    await seed.store();

    const response = await list();

    expect(
      response.data.map((row) => [
        row.vulnerability_id,
        row.uncorroborated_count,
      ]),
    ).toEqual([
      ["CVE-2024-0001", 1],
      ["CVE-2024-0002", 0],
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

  describe("filters", () => {
    // Two projects: a prod npm critical in api, a dev-only Packagist high in web.
    const seedTwoProjects = async (): Promise<{ api: string; web: string }> => {
      const api = await seed.project("api");
      const web = await seed.project("web");
      await seed.analysis({
        projectId: api,
        workspaces: {
          ".": {
            findings: [
              {
                id: "CVE-2024-0001",
                dependency: "lodash",
                score: 9.8,
                ecosystem: "npm",
              },
              {
                id: "CVE-2024-0003",
                dependency: "qs",
                score: 5.3,
                ecosystem: "npm",
              },
            ],
          },
        },
      });
      await seed.analysis({
        projectId: web,
        workspaces: {
          ".": {
            devOnly: ["guzzlehttp/guzzle"],
            findings: [
              {
                id: "CVE-2024-0002",
                dependency: "guzzlehttp/guzzle",
                score: 7.5,
                ecosystem: "Packagist",
              },
              {
                id: "CVE-2024-0003",
                dependency: "qs",
                score: 5.3,
                ecosystem: "npm",
              },
            ],
          },
        },
      });
      await seed.store();
      return { api, web };
    };

    it("narrows the list and the counts to one project", async () => {
      const { web } = await seedTwoProjects();

      const response = await list(`&project=${web}`);

      expect(counts(response)).toEqual([
        { id: "CVE-2024-0002", projects: 1, instances: 1 },
        { id: "CVE-2024-0003", projects: 1, instances: 1 },
      ]);
      expect(response.total_entries).toBe(2);
      expect(response.severity_counts).toMatchObject({
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 1,
      });
    });

    it("narrows to instances of the chosen severity classes", async () => {
      await seedTwoProjects();

      const response = await list("&severity=CRITICAL&severity=HIGH");

      expect(counts(response).map((row) => row.id)).toEqual([
        "CVE-2024-0001",
        "CVE-2024-0002",
      ]);
      expect(response.severity_counts).toMatchObject({
        CRITICAL: 1,
        HIGH: 1,
        MEDIUM: 0,
      });
    });

    it("narrows to instances of the chosen ecosystems", async () => {
      await seedTwoProjects();

      const response = await list("&ecosystem=Packagist");

      expect(counts(response)).toEqual([
        { id: "CVE-2024-0002", projects: 1, instances: 1 },
      ]);
    });

    it("narrows to dev-only or to prod instances", async () => {
      await seedTwoProjects();

      const dev = await list("&scope=dev");
      const prod = await list("&scope=prod");

      expect(counts(dev).map((row) => row.id)).toEqual(["CVE-2024-0002"]);
      expect(counts(prod)).toEqual([
        { id: "CVE-2024-0001", projects: 1, instances: 1 },
        { id: "CVE-2024-0003", projects: 2, instances: 2 },
      ]);
      expect(prod.severity_counts).toMatchObject({ HIGH: 0, CRITICAL: 1 });
    });

    it("combines filters", async () => {
      const { api } = await seedTwoProjects();

      const response = await list(`&project=${api}&ecosystem=npm&scope=prod`);

      expect(counts(response).map((row) => row.id)).toEqual([
        "CVE-2024-0001",
        "CVE-2024-0003",
      ]);
      expect(counts(response)[1]).toMatchObject({ projects: 1 });
    });

    it("narrows to instances with a fixed version, or to those without one", async () => {
      const api = await seed.project("api");
      const web = await seed.project("web");
      const lodash = { id: "CVE-2024-0001", dependency: "lodash", score: 9.8 };
      await seed.analysis({
        projectId: api,
        workspaces: {
          ".": {
            findings: [
              { ...lodash, ranges: [{ source: "OSV", fixed: "4.17.21" }] },
              {
                id: "CVE-2024-0002",
                dependency: "guzzlehttp/guzzle",
                ecosystem: "Packagist",
                score: 7.5,
                ranges: [{ source: "NVD", fixed: "7.4.5" }],
              },
            ],
          },
        },
      });
      // No source names a fix for this install of lodash.
      await seed.analysis({
        projectId: web,
        workspaces: {
          ".": { findings: [{ ...lodash, ranges: [{ source: "OSV" }] }] },
        },
      });
      await seed.store();

      const fixed = await list("&fix=available");
      const unfixed = await list("&fix=none");

      expect(counts(fixed)).toEqual([
        { id: "CVE-2024-0001", projects: 1, instances: 1 },
        { id: "CVE-2024-0002", projects: 1, instances: 1 },
      ]);
      expect(counts(unfixed)).toEqual([
        { id: "CVE-2024-0001", projects: 1, instances: 1 },
      ]);
    });

    it("refuses an unknown fix filter", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${user.organization.id}/vulnerabilities?fix=maybe`,
        user.accessToken,
      );

      expect(response.statusCode).toBe(400);
    });

    it("refuses an unknown severity class", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${user.organization.id}/vulnerabilities?severity=SEVERE`,
        user.accessToken,
      );

      expect(response.statusCode).toBe(400);
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
