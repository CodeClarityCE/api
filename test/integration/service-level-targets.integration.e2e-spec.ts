import { DataSource } from "typeorm";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";
import {
  createRunDatabase,
  dropRunDatabase,
  runDatabaseName,
} from "../utils/run-database";
import {
  type FindingFixture,
  VulnerabilityInstanceFixtures,
} from "../utils/vulnerability-instance-fixtures";

const DAY = 24 * 60 * 60 * 1000;

describe("Service level targets and due dates (e2e)", () => {
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
    user = await testHelper.createTestUser({
      email: "admin@service-level-targets.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  const organization = async () => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json().data;
  };

  const setTargets = (body: object, token = user.accessToken) =>
    testHelper.makeAuthenticatedRequest(
      "PATCH",
      `/org/${user.organization.id}/settings`,
      token,
      body,
    );

  describe("the organization setting", () => {
    it("is off by default with the suggested days", async () => {
      expect(await organization()).toMatchObject({
        service_level_targets_enabled: false,
        service_level_targets: { critical: 7, high: 30, medium: 90, low: null },
      });
    });

    it("returns the suggested days with the organization, whatever it set", async () => {
      expect(
        (await setTargets({ service_level_targets: { high: 14 } })).statusCode,
      ).toBe(200);

      expect(await organization()).toMatchObject({
        service_level_targets: { critical: 7, high: 14, medium: 90, low: null },
        suggested_service_level_targets: {
          critical: 7,
          high: 30,
          medium: 90,
          low: null,
        },
      });
    });

    it("lets an admin enable it and edit the days", async () => {
      const response = await setTargets({
        service_level_targets_enabled: true,
        service_level_targets: { critical: 3, low: 180 },
      });
      expect(response.statusCode).toBe(200);

      expect(await organization()).toMatchObject({
        service_level_targets_enabled: true,
        service_level_targets: { critical: 3, high: 30, medium: 90, low: 180 },
      });

      await setTargets({ service_level_targets: { medium: null } });
      expect((await organization()).service_level_targets).toEqual({
        critical: 3,
        high: 30,
        medium: null,
        low: 180,
      });
    });

    it("refuses a plain member, and days that are not whole and positive", async () => {
      const member = await testHelper.createTestUser({
        email: "member@service-level-targets.com",
        role: MemberRole.USER,
        organization: user.organization,
      });

      expect(
        (
          await setTargets(
            { service_level_targets_enabled: true },
            member.accessToken,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (await setTargets({ service_level_targets: { critical: 0 } }))
          .statusCode,
      ).toBe(400);
      expect(
        (await setTargets({ service_level_targets: { high: 2.5 } })).statusCode,
      ).toBe(400);
      expect(await organization()).toMatchObject({
        service_level_targets_enabled: false,
        service_level_targets: { critical: 7, high: 30, medium: 90, low: null },
      });
    });
  });

  const finding = (
    id: string,
    pkg: string,
    version: string,
    fixed: string,
    score: number,
  ): FindingFixture => ({
    id,
    dependency: pkg,
    version,
    score,
    ranges: [{ source: "OSV", fixed }],
  });

  // Critical qs (via express), high lodash and low minimist in one project.
  const seedProject = async (): Promise<string> => {
    const projectId = await seed.project("api");
    await seed.analysis({
      projectId,
      workspaces: {
        ".": {
          topLevel: ["express@4.17.0", "lodash@4.17.15", "minimist@1.2.0"],
          packages: { "express@4.17.0": ["qs@6.5.0"] },
          findings: [
            finding("CVE-2099-7601", "qs", "6.5.0", "6.5.3", 9.8),
            finding("CVE-2099-7602", "qs", "6.5.0", "6.5.2", 5.3),
            finding("CVE-2099-7603", "lodash", "4.17.15", "4.17.21", 7.5),
            finding("CVE-2099-7604", "minimist", "1.2.0", "1.2.6", 2.0),
          ],
        },
      },
    });
    await seed.store();
    return projectId;
  };

  const fromRemediation = async (
    projectId: string,
    kind: string,
    pkg: string,
    extra: object = {},
  ): Promise<string> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${user.organization.id}/projects/${projectId}/tickets/from-remediation`,
      user.accessToken,
      { kind, workspace: ".", package: pkg, ...extra },
    );
    expect(response.statusCode).toBe(201);
    return response.json().data.ticket_id as string;
  };

  const dueDateOf = async (ticketId: string): Promise<Date | null> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/tickets/${ticketId}`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    const due = response.json().data.due_date as string | null | undefined;
    return due ? new Date(due) : null;
  };

  // Days from now to the date, rounded, to absorb the request's own duration.
  const daysAhead = (date: Date | null): number | null =>
    date ? Math.round((date.getTime() - Date.now()) / DAY) : null;

  describe("due dates of new tickets", () => {
    it("default from the worst severity the ticket resolves when targets are on", async () => {
      await setTargets({ service_level_targets_enabled: true });
      const projectId = await seedProject();

      const qs = await fromRemediation(projectId, "force_version", "qs");
      const lodash = await fromRemediation(
        projectId,
        "upgrade_direct",
        "lodash",
      );
      const minimist = await fromRemediation(
        projectId,
        "upgrade_direct",
        "minimist",
      );

      expect(daysAhead(await dueDateOf(qs))).toBe(7);
      expect(daysAhead(await dueDateOf(lodash))).toBe(30);
      expect(await dueDateOf(minimist)).toBeNull();
    });

    it("are not set when targets are off", async () => {
      const projectId = await seedProject();
      const qs = await fromRemediation(projectId, "force_version", "qs");
      expect(await dueDateOf(qs)).toBeNull();
    });

    it("keep the date the user gives", async () => {
      await setTargets({ service_level_targets_enabled: true });
      const projectId = await seedProject();
      const qs = await fromRemediation(projectId, "force_version", "qs", {
        due_date: "2027-01-15T00:00:00.000Z",
      });
      expect(await dueDateOf(qs)).toEqual(new Date("2027-01-15T00:00:00.000Z"));
    });

    it("can be changed and cleared after the default is set", async () => {
      await setTargets({ service_level_targets_enabled: true });
      const projectId = await seedProject();
      const qs = await fromRemediation(projectId, "force_version", "qs");
      const update = (due_date: string | null) =>
        testHelper.makeAuthenticatedRequest(
          "PATCH",
          `/org/${user.organization.id}/tickets/${qs}`,
          user.accessToken,
          { due_date },
        );

      expect((await update("2027-03-01T00:00:00.000Z")).statusCode).toBe(200);
      expect(await dueDateOf(qs)).toEqual(new Date("2027-03-01T00:00:00.000Z"));

      expect((await update(null)).statusCode).toBe(200);
      expect(await dueDateOf(qs)).toBeNull();
    });

    it("also default on a ticket created for one vulnerability", async () => {
      await setTargets({
        service_level_targets_enabled: true,
        service_level_targets: { high: 14 },
      });
      const projectId = await seedProject();
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${user.organization.id}/tickets`,
        user.accessToken,
        {
          title: "Fix lodash",
          description: "",
          priority: "HIGH",
          type: "VULNERABILITY",
          project_id: projectId,
          vulnerability_id: "CVE-2099-7603",
          severity_class: "HIGH",
        },
      );
      expect(response.statusCode).toBe(201);
      expect(daysAhead(await dueDateOf(response.json().id))).toBe(14);
    });
  });

  describe("dashboard counts", () => {
    const manual = async (
      projectId: string,
      title: string,
      dueInDays: number | null,
    ): Promise<string> => {
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${user.organization.id}/tickets`,
        user.accessToken,
        {
          title,
          description: "",
          priority: "MEDIUM",
          type: "VULNERABILITY",
          project_id: projectId,
          ...(dueInDays === null
            ? {}
            : {
                due_date: new Date(Date.now() + dueInDays * DAY).toISOString(),
              }),
        },
      );
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    };

    it("count open tickets past their due date and those due within a week", async () => {
      const projectId = await seed.project("api");
      await manual(projectId, "late", -2);
      await manual(projectId, "very late", -30);
      await manual(projectId, "tomorrow", 1);
      await manual(projectId, "in six days", 6);
      await manual(projectId, "in ten days", 10);
      await manual(projectId, "no date", null);
      const resolvedLate = await manual(projectId, "resolved late", -5);
      const resolvedSoon = await manual(projectId, "resolved soon", 2);
      for (const id of [resolvedLate, resolvedSoon]) {
        const response = await testHelper.makeAuthenticatedRequest(
          "PATCH",
          `/org/${user.organization.id}/tickets/${id}`,
          user.accessToken,
          { status: "RESOLVED" },
        );
        expect(response.statusCode).toBe(200);
      }

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${user.organization.id}/tickets/stats`,
        user.accessToken,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        total_overdue: 2,
        total_due_this_week: 2,
      });
    });
  });
});
