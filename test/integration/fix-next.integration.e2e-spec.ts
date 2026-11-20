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

interface FixNextEntry {
  kind: string;
  package: string;
  target_version: string;
  vulnerability_id: string;
  rank: {
    severity_class: string;
    known_exploited: boolean;
    high_epss: boolean;
    prod: boolean;
    instance_count: number;
  };
  vulnerability_count: number;
  project_count: number;
  instance_count: number;
  remediations: {
    project_id: string;
    project_name: string;
    workspace: string;
    command: string | null;
    ticket: { id: string; status: string } | null;
  }[];
}

const contradicted = [
  { source: "gcve", verdict: "matched" },
  { source: "osv", verdict: "version_excluded" },
  { source: "nvd", verdict: "no_record" },
];

// A finding of `pkg@version` that `fixed` resolves; 9.8 is critical, 7.5 high.
const finding = (
  id: string,
  pkg: string,
  version: string,
  fixed: string,
  score: number,
  extra: Partial<FindingFixture> = {},
): FindingFixture => ({
  id,
  dependency: pkg,
  version,
  score,
  ranges: [{ source: "OSV", fixed }],
  ...extra,
});

describe("Fix next (e2e)", () => {
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
    await knowledge.query("TRUNCATE kev, epss");
    user = await testHelper.createTestUser({
      email: "admin@fix-next.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  const listInKev = async (...cves: string[]): Promise<void> => {
    for (const cve of cves) {
      await knowledge.query(
        `INSERT INTO kev (cve, vendor_project, product, date_added, known_ransomware_use)
         VALUES ($1, 'Vendor', 'Product', '2099-01-01', false)`,
        [cve],
      );
    }
  };
  const scoreEpss = async (cve: string, score: number): Promise<void> => {
    await knowledge.query(
      `INSERT INTO epss (cve, score, percentile) VALUES ($1, $2, 0.9)`,
      [cve, score],
    );
  };

  const fixNext = async (
    query = "",
    token = user.accessToken,
  ): Promise<{ statusCode: number; entries: FixNextEntry[] }> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/remediations/fix-next${query}`,
      token,
    );
    return {
      statusCode: response.statusCode,
      entries: (response.json() as { data: FixNextEntry[] }).data,
    };
  };

  it("ranks by severity, then exploited or high EPSS, then prod, then instances, with the reasons", async () => {
    await listInKev("CVE-2099-7501", "CVE-2099-7510", "CVE-2099-7521");
    // At the threshold counts as high; just under it does not.
    await scoreEpss("CVE-2099-7502", 0.1);
    await scoreEpss("CVE-2099-7503", 0.09);

    const api = await seed.project("api");
    const web = await seed.project("web");
    await seed.analysis({
      projectId: api,
      policyExcludes: ["CVE-2099-7522"],
      workspaces: {
        ".": {
          topLevel: [
            "lodash@4.17.15",
            "axios@0.21.0",
            "express@4.18.0",
            "qs@6.5.2",
            "debug@2.6.8",
          ],
          devTopLevel: ["webpack@5.0.0", "minimist@1.2.0"],
          devOnly: ["webpack", "minimist"],
          findings: [
            // Critical, exploited, prod.
            finding("CVE-2099-7501", "lodash", "4.17.15", "4.17.21", 9.8),
            // Critical, high EPSS, dev only.
            finding("CVE-2099-7502", "webpack", "5.0.0", "5.76.0", 9.8),
            // Critical, prod, EPSS under the threshold.
            finding("CVE-2099-7503", "axios", "0.21.0", "0.21.2", 9.8),
            // Critical, dev only, in two projects.
            finding("CVE-2099-7504", "minimist", "1.2.0", "1.2.6", 9.8),
            // High, exploited, prod, three vulnerabilities.
            finding("CVE-2099-7510", "express", "4.18.0", "4.21.2", 7.5),
            finding("CVE-2099-7511", "express", "4.18.0", "4.21.2", 7.5),
            finding("CVE-2099-7512", "express", "4.18.0", "4.21.2", 7.5),
            // High, prod; ties with debug and comes after it by name.
            finding("CVE-2099-7520", "qs", "6.5.2", "6.5.3", 7.5),
            // Hidden and policy-excluded: neither raises qs.
            finding("CVE-2099-7521", "qs", "6.5.2", "6.5.3", 9.8, {
              verdicts: contradicted,
            }),
            finding("CVE-2099-7522", "qs", "6.5.2", "6.5.3", 9.8),
            finding("CVE-2099-7530", "debug", "2.6.8", "2.6.9", 7.5),
          ],
        },
      },
    });
    await seed.analysis({
      projectId: web,
      workspaces: {
        ".": {
          devTopLevel: ["minimist@1.2.0"],
          devOnly: ["minimist"],
          findings: [
            finding("CVE-2099-7504", "minimist", "1.2.0", "1.2.6", 9.8),
          ],
        },
      },
    });
    await seed.store();

    const { statusCode, entries } = await fixNext();
    expect(statusCode).toBe(200);
    expect(
      entries.map((e) => [
        e.package,
        e.target_version,
        e.rank,
        e.project_count,
      ]),
    ).toEqual([
      [
        "lodash",
        "4.17.21",
        {
          severity_class: "CRITICAL",
          known_exploited: true,
          high_epss: false,
          prod: true,
          instance_count: 1,
        },
        1,
      ],
      [
        "webpack",
        "5.76.0",
        {
          severity_class: "CRITICAL",
          known_exploited: false,
          high_epss: true,
          prod: false,
          instance_count: 1,
        },
        1,
      ],
      [
        "axios",
        "0.21.2",
        {
          severity_class: "CRITICAL",
          known_exploited: false,
          high_epss: false,
          prod: true,
          instance_count: 1,
        },
        1,
      ],
      [
        "minimist",
        "1.2.6",
        {
          severity_class: "CRITICAL",
          known_exploited: false,
          high_epss: false,
          prod: false,
          instance_count: 2,
        },
        2,
      ],
      [
        "express",
        "4.21.2",
        {
          severity_class: "HIGH",
          known_exploited: true,
          high_epss: false,
          prod: true,
          instance_count: 3,
        },
        1,
      ],
      [
        "debug",
        "2.6.9",
        {
          severity_class: "HIGH",
          known_exploited: false,
          high_epss: false,
          prod: true,
          instance_count: 1,
        },
        1,
      ],
      [
        "qs",
        "6.5.3",
        {
          severity_class: "HIGH",
          known_exploited: false,
          high_epss: false,
          prod: true,
          instance_count: 1,
        },
        1,
      ],
    ]);

    const express = entries.find((e) => e.package === "express")!;
    expect(express).toMatchObject({
      kind: "upgrade_direct",
      vulnerability_count: 3,
      instance_count: 3,
      vulnerability_id: "CVE-2099-7510",
    });
    const minimist = entries.find((e) => e.package === "minimist")!;
    expect(
      minimist.remediations.map((r) => [r.project_name, r.workspace]).sort(),
    ).toEqual([
      ["api", "."],
      ["web", "."],
    ]);
    expect(minimist.remediations[0]!.command).toBe(
      "npm install --save-dev minimist@^1.2.6",
    );
  });

  it("shows the ticket a project already has for a vulnerability the remediation resolves", async () => {
    const api = await seed.project("api");
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          topLevel: ["lodash@4.17.15", "axios@0.21.0"],
          findings: [
            finding("CVE-2099-7501", "lodash", "4.17.15", "4.17.21", 9.8),
            finding("CVE-2099-7503", "axios", "0.21.0", "0.21.2", 7.5),
          ],
        },
      },
    });
    await seed.store();
    const created = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${user.organization.id}/tickets`,
      user.accessToken,
      {
        title: "Upgrade lodash",
        description: "Upgrade lodash",
        priority: "HIGH",
        type: "VULNERABILITY",
        project_id: api,
        vulnerability_id: "CVE-2099-7501",
      },
    );
    expect(created.statusCode).toBe(201);
    const ticketId = (created.json() as { id: string }).id;

    const { entries } = await fixNext();
    expect(entries.map((e) => [e.package, e.remediations[0]!.ticket])).toEqual([
      ["lodash", { id: ticketId, status: "OPEN" }],
      ["axios", null],
    ]);
  });

  it("returns at most `limit` entries", async () => {
    const api = await seed.project("api");
    await seed.analysis({
      projectId: api,
      workspaces: {
        ".": {
          topLevel: ["lodash@4.17.15", "axios@0.21.0"],
          findings: [
            finding("CVE-2099-7501", "lodash", "4.17.15", "4.17.21", 9.8),
            finding("CVE-2099-7503", "axios", "0.21.0", "0.21.2", 7.5),
          ],
        },
      },
    });
    await seed.store();

    const { entries } = await fixNext("?limit=1");
    expect(entries.map((e) => e.package)).toEqual(["lodash"]);
  });

  it("refuses users outside the organization", async () => {
    const outsider = await testHelper.createTestUser({
      email: "outsider@fix-next.com",
      role: MemberRole.ADMIN,
      orgName: "Elsewhere",
    });
    const { statusCode } = await fixNext("", outsider.accessToken);
    expect(statusCode).toBe(403);
  });
});
