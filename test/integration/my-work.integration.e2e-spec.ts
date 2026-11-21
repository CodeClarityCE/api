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

interface MyWorkEntry {
  ticket_id: string;
  title: string;
  status: string;
  project_id: string;
  project_name: string;
  due_date: string | null;
  deadline: string;
  remediation: {
    kind: string;
    workspace: string;
    package: string;
    target_version: string | null;
  } | null;
  vulnerability_id: string | null;
  rank: {
    severity_class: string;
    known_exploited: boolean;
    high_epss: boolean;
    prod: boolean;
    instance_count: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): string =>
  new Date(Date.now() + days * DAY_MS).toISOString();

// A finding of `pkg@version` that `fixed` resolves; 9.8 is critical, 7.5 high, 5.3 medium.
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

describe("My work (e2e)", () => {
  let user: TestUser;
  let teammate: TestUser;
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
    await knowledge.query("TRUNCATE kev, epss");
    user = await testHelper.createTestUser({
      email: "admin@my-work.com",
      role: MemberRole.ADMIN,
    });
    teammate = await testHelper.createTestUser({
      email: "teammate@my-work.com",
      role: MemberRole.USER,
      organization: user.organization,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  const myWork = async (
    as: TestUser = user,
  ): Promise<{ statusCode: number; entries: MyWorkEntry[] }> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/tickets/my-work`,
      as.accessToken,
    );
    return {
      statusCode: response.statusCode,
      entries: (response.json() as { data: MyWorkEntry[] }).data,
    };
  };

  const fromRemediation = async (
    projectId: string,
    kind: string,
    pkg: string,
  ): Promise<string> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${user.organization.id}/projects/${projectId}/tickets/from-remediation`,
      user.accessToken,
      { kind, workspace: ".", package: pkg },
    );
    expect(response.statusCode).toBe(201);
    return (response.json() as { data: { ticket_id: string } }).data.ticket_id;
  };

  // A one-vulnerability ticket made through the old create path.
  const legacy = async (
    projectId: string,
    vulnerabilityId: string,
    severityClass: string,
  ): Promise<string> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${user.organization.id}/tickets`,
      user.accessToken,
      {
        title: `Fix ${vulnerabilityId}`,
        description: "Old ticket",
        priority: "HIGH",
        type: "VULNERABILITY",
        project_id: projectId,
        vulnerability_id: vulnerabilityId,
        severity_class: severityClass,
      },
    );
    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  };

  const update = async (ticketId: string, body: object): Promise<void> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "PATCH",
      `/org/${user.organization.id}/tickets/${ticketId}`,
      user.accessToken,
      body,
    );
    expect(response.statusCode).toBe(200);
  };

  it("lists my open tickets overdue first, then due soon, then by Fix next rank", async () => {
    await knowledge.query(
      `INSERT INTO kev (cve, vendor_project, product, date_added, known_ransomware_use)
       VALUES ('CVE-2099-7704', 'Vendor', 'Product', '2099-01-01', false)`,
    );
    const api = await seed.project("api");
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          topLevel: [
            "lodash@4.17.15",
            "express@4.17.0",
            "debug@2.6.8",
            "minimist@1.2.0",
            "axios@0.21.0",
            "ms@2.0.0",
          ],
          packages: { "express@4.17.0": ["qs@6.5.0"] },
          findings: [
            finding("CVE-2099-7701", "lodash", "4.17.15", "4.17.21", 9.8),
            finding("CVE-2099-7702", "qs", "6.5.0", "6.5.3", 7.5),
            finding("CVE-2099-7703", "debug", "2.6.8", "2.6.9", 5.3),
            finding("CVE-2099-7704", "minimist", "1.2.0", "1.2.6", 9.8),
            finding("CVE-2099-7705", "axios", "0.21.0", "0.21.2", 7.5),
            finding("CVE-2099-7706", "ms", "2.0.0", "2.0.1", 7.5),
          ],
        },
      },
    });
    await seed.store();

    const me = { assigned_to_id: user.user.id };
    const lodash = await fromRemediation(api, "upgrade_direct", "lodash");
    await update(lodash, { ...me, due_date: inDays(-1) });
    const debug = await fromRemediation(api, "upgrade_direct", "debug");
    await update(debug, { ...me, due_date: inDays(-10) });
    const qs = await fromRemediation(api, "force_version", "qs");
    await update(qs, { ...me, due_date: inDays(3) });
    const minimist = await fromRemediation(api, "upgrade_direct", "minimist");
    await update(minimist, { ...me, due_date: inDays(30) });
    // Old one-vulnerability tickets: one still in the current analysis, one not.
    const axios = await legacy(api, "CVE-2099-7705", "HIGH");
    await update(axios, me);
    const gone = await legacy(api, "CVE-2099-7799", "LOW");
    await update(gone, { ...me, due_date: inDays(20) });

    // Not mine, unassigned, or no longer open: left out.
    const theirs = await legacy(api, "CVE-2099-7706", "HIGH");
    await update(theirs, { assigned_to_id: teammate.user.id });
    await legacy(api, "CVE-2099-7701", "CRITICAL");
    const resolved = await legacy(api, "CVE-2099-7702", "HIGH");
    await update(resolved, { ...me, status: "RESOLVED" });

    const { statusCode, entries } = await myWork();
    expect(statusCode).toBe(200);
    expect(entries.map((e) => [e.ticket_id, e.deadline])).toEqual([
      [debug, "overdue"],
      [lodash, "overdue"],
      [qs, "due_soon"],
      // Critical and exploited outranks high, which outranks low, whatever the due date.
      [minimist, "on_track"],
      [axios, "none"],
      [gone, "on_track"],
    ]);

    const byId = new Map(entries.map((e) => [e.ticket_id, e]));
    expect(byId.get(minimist)).toMatchObject({
      project_id: api,
      project_name: "api",
      remediation: {
        kind: "upgrade_direct",
        workspace: ".",
        package: "minimist",
        target_version: "1.2.6",
      },
      vulnerability_id: null,
      rank: {
        severity_class: "CRITICAL",
        known_exploited: true,
        prod: true,
        instance_count: 1,
      },
    });
    expect(byId.get(axios)).toMatchObject({
      remediation: null,
      vulnerability_id: "CVE-2099-7705",
      due_date: null,
      rank: { severity_class: "HIGH", known_exploited: false, prod: true },
    });
    expect(byId.get(gone)).toMatchObject({
      remediation: null,
      vulnerability_id: "CVE-2099-7799",
      rank: { severity_class: "LOW", instance_count: 0 },
    });

    // The teammate sees only their own ticket.
    const theirWork = await myWork(teammate);
    expect(theirWork.entries.map((e) => e.ticket_id)).toEqual([theirs]);
  });

  it("is empty when nothing is assigned to me", async () => {
    const api = await seed.project("api");
    await legacy(api, "CVE-2099-7701", "CRITICAL");

    const { statusCode, entries } = await myWork();
    expect(statusCode).toBe(200);
    expect(entries).toEqual([]);
  });

  it("refuses users outside the organization", async () => {
    const outsider = await testHelper.createTestUser({
      email: "outsider@my-work.com",
      orgName: "Other",
    });
    const { statusCode } = await myWork(outsider);
    expect(statusCode).toBe(403);
  });
});
