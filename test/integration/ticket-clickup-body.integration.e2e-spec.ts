import { DataSource } from "typeorm";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { createProject } from "../utils/deletion-fixtures";
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
const QS_FIX =
  "https://github.com/ljharb/qs/commit/8b4cc14cda94a5c89341b77e5fe435ec6c41be2d";

// True when the request goes to the ClickUp API host.
const isClickUp = (url: string): boolean =>
  new URL(url).origin === "https://api.clickup.com";

// Every event key is stored, unused ones as "", like the knowledge mirror does.
const events = (...list: Record<string, string>[]) =>
  list.map((e) => ({
    introduced: "",
    fixed: "",
    last_affected: "",
    limit: "",
    ...e,
  }));

// An advisory of qs naming its fix commit, and the qs package with its repository.
async function seedKnowledge(knowledge: DataSource): Promise<void> {
  await knowledge.query(
    `INSERT INTO osv (osv_id, cve, aliases, cve_aliases, summary, details, affected, "references", published, modified)
     VALUES ($1, $2, $3, $3, 'qs', 'qs', $4, $5, '2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z')`,
    [
      "GHSA-clik-0001-test",
      QS_CVE,
      JSON.stringify([QS_CVE]),
      JSON.stringify([
        {
          package: { name: "qs", ecosystem: "npm" },
          ranges: [
            {
              type: "SEMVER",
              events: events({ introduced: "0" }, { fixed: "6.5.3" }),
            },
          ],
        },
      ]),
      JSON.stringify([{ type: "FIX", url: QS_FIX }]),
    ],
  );
  await knowledge.query(
    `INSERT INTO package (name, language, description, homepage, latest_version, keywords, source)
     VALUES ('qs', 'javascript', '', '', '', '', $1)`,
    [
      JSON.stringify({
        Url: "git+https://github.com/ljharb/qs.git",
        Type: "git",
      }),
    ],
  );
}

// Stands in for the ClickUp API: creates tasks.
function clickUpReply(url: string, init?: RequestInit): Response {
  const method = init?.method ?? "GET";
  if (method === "POST" && url.includes("/task")) {
    return Response.json({
      id: "task-1",
      url: "https://app.clickup.com/t/task-1",
    });
  }
  return new Response("not found", { status: 404 });
}

describe("ClickUp task body (e2e)", () => {
  let user: TestUser;
  let seed: VulnerabilityInstanceFixtures;
  let knowledge: DataSource;
  let fetchSpy: jest.SpyInstance;
  const realFetch = global.fetch;
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
    await seedKnowledge(knowledge);
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
      email: "admin@clickup-body.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (!isClickUp(url)) {
          return realFetch(input, init);
        }
        return clickUpReply(url, init);
      });
    const connected = await request("POST", "/tickets/integrations/clickup", {
      auth_method: "API_KEY",
      api_key: "pk_key",
      list_id: "l1",
    });
    expect(connected.statusCode).toBeLessThan(300);
    fetchSpy.mockClear();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function request(
    method: "GET" | "POST",
    path: string,
    body?: object,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      method,
      `/org/${user.organization.id}${path}`,
      user.accessToken,
      body,
    );
  }

  // The markdown bodies of the tasks created in ClickUp.
  const sentBodies = (): string[] =>
    fetchSpy.mock.calls
      .filter(
        ([input, init]) =>
          isClickUp(String(input)) &&
          (init as RequestInit | undefined)?.method === "POST",
      )
      .map(
        ([, init]) =>
          JSON.parse((init as { body: string }).body).markdown_description,
      );

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

  // A project whose current analysis installs qs through express.
  const seedProject = async (): Promise<string> => {
    const projectId = await seed.project("api");
    await seed.analysis({
      projectId,
      workspaces: {
        ".": {
          topLevel: ["express@4.17.0"],
          packages: { "express@4.17.0": ["qs@6.5.0"] },
          findings: [
            finding(QS_CVE, "qs", "6.5.0", "6.5.3", 9.8),
            finding(QS_OTHER_CVE, "qs", "6.5.0", "6.5.2", 5.3),
          ],
        },
      },
    });
    await seed.store();
    return projectId;
  };

  const createRemediationTicket = async (
    projectId: string,
    extra: object = {},
  ): Promise<string> => {
    const response = await request(
      "POST",
      `/projects/${projectId}/tickets/from-remediation`,
      { kind: "force_version", workspace: ".", package: "qs", ...extra },
    );
    expect(response.statusCode).toBe(201);
    return response.json().data.ticket_id;
  };

  const expectRemediationBody = (body: string | undefined): void => {
    expect(body).toContain("Force qs to 6.5.3");
    expect(body).toContain("Installed: 6.5.0");
    expect(body).toContain(
      `- **${QS_CVE}** (CRITICAL 9.8): qs 6.5.0, fixed in 6.5.3`,
    );
    expect(body).toContain(
      `- **${QS_OTHER_CVE}** (MEDIUM 5.3): qs 6.5.0, fixed in 6.5.2`,
    );
    expect(body).toContain("  - via express@4.17.0 > qs@6.5.0");
    expect(body).toContain(
      "```\nnpm pkg set 'overrides[qs]=6.5.3' && npm install\n```",
    );
    expect(body).toContain(`  - Fix commit: ${QS_FIX}`);
    expect(body).toContain(
      "  - Compare (guessed tags): https://github.com/ljharb/qs/compare/v6.5.0...v6.5.3",
    );
    expect(body).toContain(
      "  - Registry diff: `npm diff --diff=qs@6.5.0 --diff=qs@6.5.3`",
    );
  };

  it("carries the remediation, its vulnerabilities, paths, command and links", async () => {
    const ticketId = await createRemediationTicket(await seedProject());

    const synced = await request("POST", `/tickets/${ticketId}/sync/CLICKUP`);
    expect(synced.statusCode).toBeLessThan(300);

    const [body] = sentBodies();
    expectRemediationBody(body);
  });

  it("syncs a remediation ticket on creation when asked to", async () => {
    const ticketId = await createRemediationTicket(await seedProject(), {
      sync_to_provider: "CLICKUP",
    });

    const [body] = sentBodies();
    expectRemediationBody(body);
    const links = await request("GET", `/tickets/${ticketId}/external-links`);
    expect(links.json().data).toEqual([
      expect.objectContaining({ provider: "CLICKUP", external_id: "task-1" }),
    ]);
  });

  it("still renders a one-vulnerability ticket, even without a score", async () => {
    const projectId = await createProject(user, "legacy");
    const created = await request("POST", "/tickets", {
      title: "Fix CVE-2099-7300",
      description: "Upgrade minimist before release",
      priority: "HIGH",
      type: "VULNERABILITY",
      project_id: projectId,
      vulnerability_id: "CVE-2099-7300",
      affected_package: "minimist",
      affected_version: "1.2.0",
      severity_class: "HIGH",
      recommended_version: "1.2.6",
    });
    expect(created.statusCode).toBe(201);

    const synced = await request(
      "POST",
      `/tickets/${created.json().id}/sync/CLICKUP`,
    );
    expect(synced.statusCode).toBeLessThan(300);

    const [body] = sentBodies();
    expect(body).toContain("Upgrade minimist before release");
    expect(body).toContain("- **CVE/ID**: CVE-2099-7300");
    expect(body).toContain("- **Package**: minimist");
    expect(body).toContain("- **Version**: 1.2.0");
    expect(body).toContain("- **Severity**: HIGH");
    expect(body).toContain("- **Recommended Version**: 1.2.6");
    expect(body).not.toContain("CVSS Score");
  });

  it("shows the diff links of each instance on the ticket page", async () => {
    const ticketId = await createRemediationTicket(await seedProject());

    const response = await request("GET", `/tickets/${ticketId}`);
    const instances = response.json().data.instances;

    expect(instances[0]).toEqual(
      expect.objectContaining({
        vulnerability_id: QS_CVE,
        diff_links: {
          fix_commits: [
            { url: QS_FIX, sha: "8b4cc14cda94a5c89341b77e5fe435ec6c41be2d" },
          ],
          compare: expect.objectContaining({
            url: "https://github.com/ljharb/qs/compare/v6.5.0...v6.5.3",
          }),
          registry_diff: {
            tool: "npm",
            command: "npm diff --diff=qs@6.5.0 --diff=qs@6.5.3",
          },
        },
      }),
    );
    expect(instances[1].diff_links.fix_commits).toEqual([]);
  });
});
