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

const QS_CVE = "CVE-2099-7101";
const QS_OTHER_CVE = "CVE-2099-7102";
const LODASH_CVE = "CVE-2099-7103";

interface RemediationIdentity {
  kind: string;
  workspace: string;
  package: string;
}

interface CreateResult {
  created: boolean;
  ticket_id: string | null;
  duplicate: { ticket_id: string; title: string; status: string } | null;
}

describe("Tickets from remediations (e2e)", () => {
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
      email: "admin@remediation-tickets.com",
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

  // A project whose current analysis installs qs through express, and lodash directly.
  const seedProject = async (name = "api"): Promise<string> => {
    const projectId = await seed.project(name);
    await seed.analysis({
      projectId,
      workspaces: {
        ".": {
          topLevel: ["express@4.17.0", "lodash@4.17.15"],
          packages: { "express@4.17.0": ["qs@6.5.0"] },
          findings: [
            finding(QS_CVE, "qs", "6.5.0", "6.5.3", 9.8),
            finding(QS_OTHER_CVE, "qs", "6.5.0", "6.5.2", 5.3),
            finding(LODASH_CVE, "lodash", "4.17.15", "4.17.21"),
          ],
        },
      },
    });
    await seed.store();
    return projectId;
  };

  const QS_FORCE: RemediationIdentity = {
    kind: "force_version",
    workspace: ".",
    package: "qs",
  };

  const create = async (
    projectId: string,
    remediation: RemediationIdentity,
    extra: object = {},
    as: TestUser = user,
  ) =>
    testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${as.organization.id}/projects/${projectId}/tickets/from-remediation`,
      as.accessToken,
      { ...remediation, ...extra },
    );

  const ticket = async (id: string) => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/tickets/${id}`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json().data;
  };

  const ticketCount = async (): Promise<number> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/tickets`,
      user.accessToken,
    );
    return response.json().matching_count as number;
  };

  it("creates a ticket prefilled with the remediation, its instances, paths and command", async () => {
    const projectId = await seedProject();

    const response = await create(projectId, QS_FORCE);
    expect(response.statusCode).toBe(201);
    const result = response.json().data as CreateResult;
    expect(result).toEqual({
      created: true,
      ticket_id: expect.any(String),
      duplicate: null,
    });

    const details = await ticket(result.ticket_id!);
    expect(details).toEqual(
      expect.objectContaining({
        title: "Force qs to 6.5.3",
        status: "OPEN",
        priority: "CRITICAL",
        type: "VULNERABILITY",
        severity_class: "CRITICAL",
        severity_score: 9.8,
        affected_package: "qs",
        recommended_version: "6.5.3",
        vulnerability_id: null,
        project_id: projectId,
        remediation: {
          kind: "force_version",
          workspace: ".",
          package: "qs",
          installed_versions: ["6.5.0"],
          target_version: "6.5.3",
          potentially_breaking: false,
          package_manager: "npm",
          command: "npm pkg set 'overrides[qs]=6.5.3' && npm install",
          manifest_edit: null,
        },
      }),
    );
    expect(details.instances).toEqual([
      expect.objectContaining({
        vulnerability_id: QS_CVE,
        package: "qs",
        installed_version: "6.5.0",
        workspace: ".",
        prod: true,
        severity_class: "CRITICAL",
        severity_score: 9.8,
        fixed_version: "6.5.3",
        is_active: true,
        top_level_dependencies: [
          {
            name: "express",
            version: "4.17.0",
            dev: false,
            path: [
              { name: "express", version: "4.17.0" },
              { name: "qs", version: "6.5.0" },
            ],
          },
        ],
      }),
      expect.objectContaining({
        vulnerability_id: QS_OTHER_CVE,
        severity_class: "MEDIUM",
        is_active: true,
      }),
    ]);
    expect(details.description).toContain(QS_CVE);
    expect(details.description).toContain(QS_OTHER_CVE);
    expect(details.description).toContain("express@4.17.0 > qs@6.5.0");
    expect(details.description).toContain(
      "npm pkg set 'overrides[qs]=6.5.3' && npm install",
    );
  });

  describe("duplicate detection", () => {
    const createdId = async (
      projectId: string,
      remediation: RemediationIdentity,
      extra: object = {},
    ): Promise<string> => {
      const result = (await create(projectId, remediation, extra)).json()
        .data as CreateResult;
      expect(result.created).toBe(true);
      return result.ticket_id!;
    };

    it("warns about the open ticket instead of creating a second one", async () => {
      const projectId = await seedProject();
      const first = await createdId(projectId, QS_FORCE);

      const response = await create(projectId, QS_FORCE);
      expect(response.statusCode).toBe(201);
      expect(response.json().data).toEqual({
        created: false,
        ticket_id: null,
        duplicate: {
          ticket_id: first,
          title: "Force qs to 6.5.3",
          status: "OPEN",
        },
      });
      expect(await ticketCount()).toBe(1);
    });

    it("still matches once the remediation's target version has moved", async () => {
      const projectId = await seedProject();
      const first = await createdId(projectId, QS_FORCE);
      await seed.analysis({
        projectId,
        workspaces: {
          ".": {
            topLevel: ["express@4.17.0"],
            packages: { "express@4.17.0": ["qs@6.5.0"] },
            findings: [
              finding(QS_CVE, "qs", "6.5.0", "6.5.3", 9.8),
              finding("CVE-2099-7104", "qs", "6.5.0", "6.5.5", 6.1),
            ],
          },
        },
      });
      await seed.store();

      const result = (await create(projectId, QS_FORCE)).json()
        .data as CreateResult;
      expect(result.duplicate?.ticket_id).toBe(first);
    });

    it("creates the ticket anyway when asked to", async () => {
      const projectId = await seedProject();
      const first = await createdId(projectId, QS_FORCE);

      const second = await createdId(projectId, QS_FORCE, {
        allow_duplicate: true,
      });
      expect(second).not.toBe(first);
      expect(await ticketCount()).toBe(2);
    });

    it("ignores tickets that are no longer open", async () => {
      const projectId = await seedProject();
      const first = await createdId(projectId, QS_FORCE);
      const patch = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/org/${user.organization.id}/tickets/${first}`,
        user.accessToken,
        { status: "RESOLVED" },
      );
      expect(patch.statusCode).toBe(200);

      const result = (await create(projectId, QS_FORCE)).json()
        .data as CreateResult;
      expect(result.created).toBe(true);
    });

    it("tells apart other remediations and other projects", async () => {
      const projectId = await seedProject("api");
      const otherProject = await seedProject("web");
      await createdId(projectId, QS_FORCE);

      await createdId(otherProject, QS_FORCE);
      await createdId(projectId, {
        kind: "upgrade_direct",
        workspace: ".",
        package: "lodash",
      });
      expect(await ticketCount()).toBe(3);
    });
  });

  it("answers 404 for a remediation the current analysis does not have", async () => {
    const projectId = await seedProject();
    const response = await create(projectId, {
      kind: "upgrade_direct",
      workspace: ".",
      package: "left-pad",
    });
    expect(response.statusCode).toBe(404);
  });

  it("does not create tickets for a project of another organization", async () => {
    const projectId = await seedProject();
    const outsider = await testHelper.createTestUser({
      email: "outsider@remediation-tickets.com",
      orgName: "Other",
      role: MemberRole.ADMIN,
    });

    const response = await create(projectId, QS_FORCE, {}, outsider);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(await ticketCount()).toBe(0);
  });

  it("never creates tickets on its own when an analysis is stored", async () => {
    await seedProject();
    expect(await ticketCount()).toBe(0);
  });

  describe("ticket state of remediations", () => {
    interface FixNextEntry {
      package: string;
      remediations: { ticket: { id: string; status: string } | null }[];
    }
    const ticketsInFixNext = async (): Promise<[string, unknown][]> => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${user.organization.id}/remediations/fix-next`,
        user.accessToken,
      );
      expect(response.statusCode).toBe(200);
      return (response.json().data as FixNextEntry[]).map((e) => [
        e.package,
        e.remediations[0]!.ticket,
      ]);
    };

    it("shows the ticket created from a remediation, and only on that remediation", async () => {
      const projectId = await seedProject();
      const result = (await create(projectId, QS_FORCE)).json()
        .data as CreateResult;

      expect(await ticketsInFixNext()).toEqual([
        ["qs", { id: result.ticket_id, status: "OPEN" }],
        ["lodash", null],
      ]);
    });

    it("prefers the open remediation ticket over a resolved one", async () => {
      const projectId = await seedProject();
      const first = (await create(projectId, QS_FORCE)).json()
        .data as CreateResult;
      await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/org/${user.organization.id}/tickets/${first.ticket_id}`,
        user.accessToken,
        { status: "RESOLVED" },
      );
      const second = (await create(projectId, QS_FORCE)).json()
        .data as CreateResult;

      expect((await ticketsInFixNext())[0]).toEqual([
        "qs",
        { id: second.ticket_id, status: "OPEN" },
      ]);
    });
  });
});
