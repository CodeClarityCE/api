import { DataSource } from "typeorm";

import {
  AnalysisPublisher,
  type InMemoryAnalysisPublisher,
} from "../../src/base_modules/analyses/analysis-publisher";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";
import {
  createRunDatabase,
  dropRunDatabase,
  runDatabaseName,
} from "../utils/run-database";
import { VulnerabilityInstanceFixtures } from "../utils/vulnerability-instance-fixtures";

interface ProjectFreshness {
  project_id: string;
  project_name: string;
  analysis_id: string;
  analyzed_on: string;
  stale: boolean;
}

interface FreshnessResponse {
  threshold_days: number;
  projects: ProjectFreshness[];
}

const clean = { ".": { findings: [] } };

describe("Project freshness (e2e)", () => {
  let user: TestUser;
  let seed: VulnerabilityInstanceFixtures;
  let knowledge: DataSource;
  const knowledgeDb = runDatabaseName("knowledge");

  beforeAll(async () => {
    await createRunDatabase(knowledgeDb);
    knowledge = new DataSource({
      type: "postgres",
      host: process.env["PG_DB_HOST"] ?? "localhost",
      port: Number(process.env["PG_DB_PORT"] ?? 5432),
      username: process.env["PG_DB_USER"] ?? "postgres",
      password: process.env["PG_DB_PASSWORD"] ?? "",
      database: knowledgeDb,
      entities: ["src/codeclarity_modules/knowledge/**/*.entity.ts"],
      synchronize: true,
      extra: { max: 2 },
    });
    await knowledge.initialize();
    process.env["KNOWLEDGE_TEST_DB_NAME"] = knowledgeDb;
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
    delete process.env["KNOWLEDGE_TEST_DB_NAME"];
    if (knowledge?.isInitialized) await knowledge.destroy();
    await dropRunDatabase(knowledgeDb);
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    await knowledge.query(`TRUNCATE osv, nvd, gcve CASCADE`);
    user = await testHelper.createTestUser({
      email: "admin@freshness.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  const freshness = async (): Promise<FreshnessResponse> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/freshness`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return (response.json() as { data: FreshnessResponse }).data;
  };
  const flags = (response: FreshnessResponse) =>
    Object.fromEntries(response.projects.map((p) => [p.project_name, p.stale]));

  describe("stale projects", () => {
    it("flags projects whose current analysis is older than 14 days by default", async () => {
      const old = await seed.project("old");
      const recent = await seed.project("recent");
      const failedSince = await seed.project("failed-since");
      const otherBranch = await seed.project("other-branch");
      await seed.analysis({
        projectId: old,
        age: "20 days",
        workspaces: clean,
      });
      await seed.analysis({
        projectId: recent,
        age: "3 days",
        workspaces: clean,
      });
      // A newer failed analysis or another branch does not make a project fresh.
      await seed.analysis({
        projectId: failedSince,
        age: "30 days",
        workspaces: clean,
      });
      await seed.analysis({
        projectId: failedSince,
        age: "1 day",
        status: "failed",
        workspaces: clean,
      });
      await seed.analysis({
        projectId: otherBranch,
        age: "15 days",
        workspaces: clean,
      });
      await seed.analysis({
        projectId: otherBranch,
        age: "1 day",
        branch: "feature",
        workspaces: clean,
      });
      await seed.store();

      const response = await freshness();

      expect(response.threshold_days).toBe(14);
      expect(flags(response)).toEqual({
        old: true,
        recent: false,
        "failed-since": true,
        "other-branch": true,
      });
      // Stale projects come first, oldest analysis first.
      expect(response.projects.map((p) => p.project_name)).toEqual([
        "failed-since",
        "old",
        "other-branch",
        "recent",
      ]);
      expect(response.projects[0]).toMatchObject({
        project_id: failedSince,
        analysis_id: expect.any(String),
        analyzed_on: expect.any(String),
      });
    });

    const setThreshold = (token: string, days: unknown) =>
      testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/org/${user.organization.id}/settings`,
        token,
        { freshness_threshold_days: days },
      );

    it("uses the threshold an admin sets for the organization", async () => {
      const old = await seed.project("old");
      await seed.analysis({
        projectId: old,
        age: "20 days",
        workspaces: clean,
      });
      await seed.store();

      expect((await setThreshold(user.accessToken, 30)).statusCode).toBe(200);
      const response = await freshness();

      expect(response.threshold_days).toBe(30);
      expect(flags(response)).toEqual({ old: false });
    });

    it("refuses a threshold from a plain member or one below a day", async () => {
      const member = await testHelper.createTestUser({
        email: "member@freshness.com",
        role: MemberRole.USER,
        organization: user.organization,
      });

      expect((await setThreshold(member.accessToken, 30)).statusCode).toBe(403);
      expect((await setThreshold(user.accessToken, 0)).statusCode).toBe(400);
      expect((await setThreshold(user.accessToken, 2.5)).statusCode).toBe(400);
      expect((await freshness()).threshold_days).toBe(14);
    });
  });

  describe("vulnerabilities not yet checked", () => {
    const CVE = "CVE-2099-0100";
    const GCVE = "GCVE-1-2099-0001";

    interface NotYetChecked {
      vulnerability_id: string;
      published: string | null;
      projects: ProjectFreshness[];
    }

    const notYetChecked = async (id: string): Promise<NotYetChecked> => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${user.organization.id}/vulnerabilities/${id}/freshness`,
        user.accessToken,
      );
      expect(response.statusCode).toBe(200);
      return (response.json() as { data: NotYetChecked }).data;
    };

    const daysAgo = (days: number): string =>
      new Date(Date.now() - days * 86_400_000).toISOString();

    it("lists the projects whose current analysis predates the vulnerability's earliest publication", async () => {
      // NVD published it 10 days ago, but a GHSA aliasing it 12 days ago.
      await knowledge.query(
        `INSERT INTO nvd (nvd_id, published, "lastModified") VALUES ($1, $2, $2)`,
        [CVE, daysAgo(10)],
      );
      await knowledge.query(
        `INSERT INTO osv (osv_id, aliases, cve_aliases, published, modified) VALUES ('GHSA-fres-hnes-s001', $1, $1, $2, $2)`,
        [JSON.stringify([CVE]), daysAgo(12)],
      );
      const before = await seed.project("before");
      const between = await seed.project("between");
      const after = await seed.project("after");
      const present = await seed.project("present");
      await seed.analysis({
        projectId: before,
        age: "20 days",
        workspaces: clean,
      });
      await seed.analysis({
        projectId: between,
        age: "11 days",
        workspaces: clean,
      });
      await seed.analysis({
        projectId: after,
        age: "2 days",
        workspaces: clean,
      });
      // An analysis that found it has checked it, whatever the dates say.
      await seed.analysis({
        projectId: present,
        age: "20 days",
        workspaces: {
          ".": { findings: [{ id: CVE, dependency: "lodash", score: 9.8 }] },
        },
      });
      await seed.store();

      const response = await notYetChecked(CVE);

      expect(new Date(response.published!).getTime()).toBeCloseTo(
        new Date(daysAgo(12)).getTime(),
        -4,
      );
      expect(response.projects).toEqual([
        expect.objectContaining({
          project_id: before,
          project_name: "before",
          stale: true,
        }),
      ]);
    });

    it("finds GCVE-only publications and lists nothing for an unknown vulnerability", async () => {
      await knowledge.query(
        `INSERT INTO gcve (gcve_id, date_published) VALUES ($1, $2)`,
        [GCVE, daysAgo(5)],
      );
      const recent = await seed.project("recent");
      await seed.analysis({
        projectId: recent,
        age: "6 days",
        workspaces: clean,
      });
      await seed.store();

      const gcve = await notYetChecked(GCVE);
      expect(gcve.projects).toEqual([
        expect.objectContaining({ project_name: "recent", stale: false }),
      ]);

      const unknown = await notYetChecked("CVE-2099-9999");
      expect(unknown).toEqual({
        vulnerability_id: "CVE-2099-9999",
        published: null,
        projects: [],
      });
    });
  });

  describe("re-analyse", () => {
    const reanalyse = (projectId: string, token = user.accessToken) =>
      testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${user.organization.id}/projects/${projectId}/analyses/reanalyse`,
        token,
      );

    it("submits a new analysis with the configuration of the project's last default-branch analysis", async () => {
      const old = await seed.project("old");
      await seed.analysis({
        projectId: old,
        age: "20 days",
        policyExcludes: ["CVE-2099-0200"],
        workspaces: clean,
      });
      await seed.analysis({
        projectId: old,
        age: "1 day",
        branch: "feature",
        workspaces: clean,
      });
      await seed.store();
      const [previous] = (await freshness()).projects;
      const publisher = testHelper
        .getApp()
        .get<InMemoryAnalysisPublisher>(AnalysisPublisher);
      publisher.published.length = 0;

      const response = await reanalyse(old);

      expect(response.statusCode).toBe(201);
      const id = (response.json() as { id: string }).id;
      const get = async (analysisId: string) =>
        (
          (
            await testHelper.makeAuthenticatedRequest(
              "GET",
              `/org/${user.organization.id}/projects/${old}/analyses/${analysisId}`,
              user.accessToken,
            )
          ).json() as {
            data: { status: string; branch: string };
          }
        ).data;
      expect(await get(id)).toMatchObject({
        status: "requested",
        branch: "main",
      });
      // The API never returns an analysis's configuration, so read it from the table.
      const configs: { id: string; config: unknown }[] = await testHelper
        .getDataSource()
        .query(`SELECT id, config FROM analysis WHERE id = ANY($1)`, [
          [id, previous!.analysis_id],
        ]);
      const [created, before] = [id, previous!.analysis_id].map(
        (analysisId) => configs.find((row) => row.id === analysisId)!.config,
      );
      expect(before).toHaveProperty("vuln-finder");
      expect(created).toEqual(before);
      expect(publisher.published).toEqual([
        expect.objectContaining({ analysis_id: id, project_id: old }),
      ]);
    });

    it("refuses a project with no analysis to repeat, or a user outside the organization", async () => {
      const fresh = await seed.project("never-analysed");
      const outsider = await testHelper.createTestUser({
        email: "outsider@freshness.com",
        orgName: "Other",
      });

      expect((await reanalyse(fresh)).statusCode).toBe(404);
      expect((await reanalyse(fresh, outsider.accessToken)).statusCode).toBe(
        403,
      );
    });
  });
});
