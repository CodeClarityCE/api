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

const QS_CVE = "CVE-2099-7201";
const QS_OTHER_CVE = "CVE-2099-7202";
const QS_NEW_CVE = "CVE-2099-7203";
const LODASH_CVE = "CVE-2099-7204";

const QS_FORCE = { kind: "force_version", workspace: ".", package: "qs" };

interface TicketInstance {
  vulnerability_id: string;
  analysis_id: string;
  is_active: boolean;
  resolved_on: string | null;
}

describe("Ticket instances follow the current analysis (e2e)", () => {
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
      email: "admin@ticket-instances.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  const finding = (
    id: string,
    pkg: string,
    version: string,
    fixed: string,
    score = 7.5,
  ): FindingFixture => ({
    id,
    dependency: pkg,
    version,
    score,
    ranges: [{ source: "OSV", fixed }],
  });

  // One analysis of the project installing qs through express and lodash directly.
  const analyse = async (
    projectId: string,
    findings: FindingFixture[],
    extra: { age?: string; branch?: string } = {},
  ): Promise<string> => {
    const id = await seed.analysis({
      projectId,
      ...extra,
      workspaces: {
        ".": {
          topLevel: ["express@4.17.0", "lodash@4.17.15"],
          packages: { "express@4.17.0": ["qs@6.5.0"] },
          findings,
        },
      },
    });
    await seed.store();
    return id;
  };

  const FIRST_FINDINGS = [
    finding(QS_CVE, "qs", "6.5.0", "6.5.3", 9.8),
    finding(QS_OTHER_CVE, "qs", "6.5.0", "6.5.2", 5.3),
    finding(LODASH_CVE, "lodash", "4.17.15", "4.17.21"),
  ];

  const request = (method: string, path: string, body?: object) =>
    testHelper.makeAuthenticatedRequest(
      method,
      `/org/${user.organization.id}${path}`,
      user.accessToken,
      body,
    );

  const createTicket = async (
    projectId: string,
    remediation: object = QS_FORCE,
  ): Promise<string> => {
    const response = await request(
      "POST",
      `/projects/${projectId}/tickets/from-remediation`,
      remediation,
    );
    expect(response.statusCode).toBe(201);
    return response.json().data.ticket_id as string;
  };

  // A ticket made before remediations: it tracks one vulnerability.
  const createLegacyTicket = async (
    projectId: string,
    vulnerabilityId: string,
  ): Promise<string> => {
    const response = await request("POST", "/tickets", {
      title: `Fix ${vulnerabilityId}`,
      description: "One vulnerability",
      priority: "HIGH",
      type: "VULNERABILITY",
      project_id: projectId,
      vulnerability_id: vulnerabilityId,
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };

  const ticket = async (id: string) => {
    const response = await request("GET", `/tickets/${id}`);
    expect(response.statusCode).toBe(200);
    return response.json().data;
  };

  const instancesOf = async (id: string): Promise<[string, boolean][]> =>
    ((await ticket(id)).instances as TicketInstance[]).map((i) => [
      i.vulnerability_id,
      i.is_active,
    ]);

  describe("instance list", () => {
    it("adds the new instances its remediation resolves and resolves the ones that are gone", async () => {
      const projectId = await seed.project("api");
      await analyse(projectId, FIRST_FINDINGS, { age: "2 hours" });
      const ticketId = await createTicket(projectId);
      const patch = await request("PATCH", `/tickets/${ticketId}`, {
        assigned_to_id: user.user.id,
      });
      expect(patch.statusCode).toBe(200);

      const second = await analyse(projectId, [
        finding(QS_CVE, "qs", "6.5.0", "6.5.3", 9.8),
        finding(QS_NEW_CVE, "qs", "6.5.0", "6.5.5", 6.1),
        finding(LODASH_CVE, "lodash", "4.17.15", "4.17.21"),
      ]);

      const details = await ticket(ticketId);
      expect(details).toEqual(
        expect.objectContaining({
          title: "Force qs to 6.5.3",
          status: "OPEN",
          assigned_to_id: user.user.id,
          recommended_version: "6.5.5",
          active_occurrence_count: 2,
          occurrence_count: 3,
        }),
      );
      expect(details.remediation).toEqual(
        expect.objectContaining({
          target_version: "6.5.5",
          command: "npm pkg set 'overrides[qs]=6.5.5' && npm install",
        }),
      );
      const instances = details.instances as TicketInstance[];
      expect(instances.map((i) => [i.vulnerability_id, i.is_active])).toEqual([
        [QS_CVE, true],
        [QS_NEW_CVE, true],
        [QS_OTHER_CVE, false],
      ]);
      expect(instances.filter((i) => i.is_active)).toEqual([
        expect.objectContaining({ analysis_id: second, resolved_on: null }),
        expect.objectContaining({ analysis_id: second, resolved_on: null }),
      ]);
      expect(instances[2]!.resolved_on).toEqual(expect.any(String));
    });

    it("leaves tickets alone for analyses that are not the current one", async () => {
      const projectId = await seed.project("api");
      await analyse(projectId, FIRST_FINDINGS, { age: "2 hours" });
      const ticketId = await createTicket(projectId);

      await analyse(projectId, [], { branch: "feature" });
      await seed.analysis({
        projectId,
        status: "failed",
        workspaces: { ".": { findings: [] } },
      });
      await seed.store();

      expect(await instancesOf(ticketId)).toEqual([
        [QS_CVE, true],
        [QS_OTHER_CVE, true],
      ]);
    });

    it("gives a one-vulnerability ticket the instances of its vulnerability", async () => {
      const projectId = await seed.project("api");
      await analyse(projectId, FIRST_FINDINGS, { age: "2 hours" });
      const ticketId = await createLegacyTicket(projectId, LODASH_CVE);

      await analyse(projectId, FIRST_FINDINGS);

      expect(await instancesOf(ticketId)).toEqual([[LODASH_CVE, true]]);
    });
  });

  describe("auto-resolve", () => {
    const setAutoResolve = async (enabled: boolean): Promise<void> => {
      const response = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/org/${user.organization.id}/settings`,
        user.accessToken,
        { auto_resolve_tickets: enabled },
      );
      expect(response.statusCode).toBeLessThan(300);
    };

    const events = async (id: string) => {
      const response = await request("GET", `/tickets/${id}/events`);
      expect(response.statusCode).toBe(200);
      return response.json().data as {
        event_type: string;
        event_data: Record<string, unknown>;
      }[];
    };

    it("resolves a ticket once the current analysis has none of its instances", async () => {
      await setAutoResolve(true);
      const projectId = await seed.project("api");
      await analyse(projectId, FIRST_FINDINGS, { age: "2 hours" });
      const qsTicket = await createTicket(projectId);
      const lodashTicket = await createTicket(projectId, {
        kind: "upgrade_direct",
        workspace: ".",
        package: "lodash",
      });

      const second = await analyse(projectId, [
        finding(LODASH_CVE, "lodash", "4.17.15", "4.17.21"),
      ]);

      const resolved = await ticket(qsTicket);
      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.resolved_on).toEqual(expect.any(String));
      expect(resolved.title).toBe("Force qs to 6.5.3");
      expect(await instancesOf(qsTicket)).toEqual([
        [QS_CVE, false],
        [QS_OTHER_CVE, false],
      ]);
      expect(await events(qsTicket)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: "STATUS_CHANGED",
            event_data: expect.objectContaining({
              old_status: "OPEN",
              new_status: "RESOLVED",
              source: "automation",
              analysis_id: second,
            }),
          }),
        ]),
      );
      expect((await ticket(lodashTicket)).status).toBe("OPEN");
    });

    it("keeps the ticket open when the setting is off", async () => {
      await setAutoResolve(false);
      const projectId = await seed.project("api");
      await analyse(projectId, FIRST_FINDINGS, { age: "2 hours" });
      const ticketId = await createTicket(projectId);

      await analyse(projectId, []);

      const details = await ticket(ticketId);
      expect(details.status).toBe("OPEN");
      expect(details.active_occurrence_count).toBe(0);
    });

    it("resolves a one-vulnerability ticket once its vulnerability is gone", async () => {
      await setAutoResolve(true);
      const projectId = await seed.project("api");
      await analyse(projectId, FIRST_FINDINGS, { age: "2 hours" });
      const gone = await createLegacyTicket(projectId, QS_OTHER_CVE);
      const kept = await createLegacyTicket(projectId, LODASH_CVE);

      await analyse(projectId, [
        finding(QS_CVE, "qs", "6.5.0", "6.5.3", 9.8),
        finding(LODASH_CVE, "lodash", "4.17.15", "4.17.21"),
      ]);

      expect((await ticket(gone)).status).toBe("RESOLVED");
      expect((await ticket(kept)).status).toBe("OPEN");
    });

    it("does not resolve a ticket from an analysis older than the ticket", async () => {
      await setAutoResolve(true);
      const projectId = await seed.project("api");
      const ticketId = await createLegacyTicket(projectId, LODASH_CVE);

      // An analysis made before the ticket, stored only now (as a backfill does).
      await analyse(projectId, [], { age: "2 days" });

      expect((await ticket(ticketId)).status).toBe("OPEN");
    });

    it("does not resolve tickets from an analysis without vulnerability results", async () => {
      await setAutoResolve(true);
      const projectId = await seed.project("api");
      await analyse(projectId, FIRST_FINDINGS, { age: "2 hours" });
      const ticketId = await createTicket(projectId);

      const id = await seed.analysis({
        projectId,
        workspaces: { ".": { findings: [] } },
      });
      await testHelper
        .getDataSource()
        .query(
          `DELETE FROM result WHERE "analysisId" = $1 AND plugin = 'vuln-finder'`,
          [id],
        );
      await seed.store();

      expect((await ticket(ticketId)).status).toBe("OPEN");
    });
  });
  describe("ticket state", () => {
    // Project "api" has a ticket forcing qs; project "web" has the same findings and no ticket.
    const seedTicketed = async () => {
      const api = await seed.project("api");
      const web = await seed.project("web");
      await analyse(api, FIRST_FINDINGS);
      await analyse(web, FIRST_FINDINGS);
      const ticketId = await createTicket(api);
      return { api, web, ticketId };
    };

    const list = async (query = "") => {
      const response = await request("GET", `/vulnerabilities${query}`);
      expect(response.statusCode).toBe(200);
      return (
        response.json().data as {
          vulnerability_id: string;
          instance_count: number;
          ticketed_instance_count: number;
        }[]
      ).map((r) => [
        r.vulnerability_id,
        r.instance_count,
        r.ticketed_instance_count,
      ]);
    };

    const pageProjects = async (id: string) => {
      const response = await request("GET", `/vulnerabilities/${id}`);
      expect(response.statusCode).toBe(200);
      return response.json().data.projects as {
        project_name: string;
        ticket_state: string;
        instances: { ticket: { id: string; status: string } | null }[];
      }[];
    };

    it("shows the ticket state of each affected project on the vulnerability page", async () => {
      const { ticketId } = await seedTicketed();

      const projects = await pageProjects(QS_CVE);
      expect(
        projects.map((p) => [
          p.project_name,
          p.ticket_state,
          p.instances.map((i) => i.ticket),
        ]),
      ).toEqual([
        ["api", "open", [{ id: ticketId, status: "OPEN" }]],
        ["web", "none", [null]],
      ]);
    });

    it("counts one-vulnerability tickets and leaves out tickets that are no longer open", async () => {
      const { web, ticketId } = await seedTicketed();
      const legacy = await createLegacyTicket(web, QS_CVE);
      await request("PATCH", `/tickets/${ticketId}`, { status: "RESOLVED" });

      const projects = await pageProjects(QS_CVE);
      expect(projects.map((p) => [p.project_name, p.ticket_state])).toEqual([
        ["api", "none"],
        ["web", "open"],
      ]);
      expect(projects[1]!.instances[0]!.ticket).toEqual({
        id: legacy,
        status: "OPEN",
      });
    });

    it("counts ticketed instances on each list row", async () => {
      await seedTicketed();

      expect(await list()).toEqual([
        [QS_CVE, 2, 1],
        [LODASH_CVE, 2, 0],
        [QS_OTHER_CVE, 2, 1],
      ]);
    });

    it("filters the list by ticket state", async () => {
      const { api } = await seedTicketed();

      expect(await list(`?ticket=open`)).toEqual([
        [QS_CVE, 1, 1],
        [QS_OTHER_CVE, 1, 1],
      ]);
      expect(await list(`?ticket=none&project=${api}`)).toEqual([
        [LODASH_CVE, 1, 0],
      ]);
      const invalid = await request("GET", `/vulnerabilities?ticket=maybe`);
      expect(invalid.statusCode).toBe(400);
    });
  });
});
