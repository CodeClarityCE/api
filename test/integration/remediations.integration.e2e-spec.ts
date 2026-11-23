import { DataSource } from "typeorm";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { RemediationsService } from "../../src/codeclarity_modules/remediations/remediations.service";
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

// Every event key is stored, unused ones as "", like the knowledge mirror does.
const events = (...list: Record<string, string>[]) =>
  list.map((e) => ({
    introduced: "",
    fixed: "",
    last_affected: "",
    limit: "",
    ...e,
  }));

// One OSV record of `cve` with ECOSYSTEM ranges per package, each list read as [introduced, fixed] pairs.
async function advisory(
  knowledge: DataSource,
  osvId: string,
  cve: string,
  packages: Record<string, { ecosystem: string; ranges: string[][] }>,
): Promise<void> {
  const affected = Object.entries(packages).map(
    ([name, { ecosystem, ranges }]) => ({
      package: { name, ecosystem },
      ranges: [
        {
          type: "ECOSYSTEM",
          events: events(
            ...ranges.flatMap(([introduced, fixed]) => [
              { introduced: introduced! },
              ...(fixed ? [{ fixed }] : []),
            ]),
          ),
        },
      ],
    }),
  );
  await knowledge.query(
    `INSERT INTO osv (osv_id, cve, aliases, cve_aliases, summary, details, affected, published, modified)
     VALUES ($1, $2, $3, $3, 'Remediation', 'Remediation', $4, '2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z')`,
    [osvId, cve, JSON.stringify([cve]), JSON.stringify(affected)],
  );
}

const LODASH_CVE = "CVE-2099-3001";
const LODASH_OTHER_CVE = "CVE-2099-3002";
const MAJOR_ONLY_CVE = "CVE-2099-3003";
const QS_CVE = "CVE-2099-3004";
const NO_FIX_CVE = "CVE-2099-3005";
const SYMFONY_CVE = "CVE-2099-3006";

async function seedKnowledge(knowledge: DataSource): Promise<void> {
  // Fixed in 3.x and 4.x.
  await advisory(knowledge, "GHSA-rem-0001-test", LODASH_CVE, {
    lodash: {
      ecosystem: "npm",
      ranges: [
        ["0", "3.10.2"],
        ["4.0.0", "4.17.21"],
      ],
    },
  });
  // Fixed in 4.17.12 only.
  await advisory(knowledge, "GHSA-rem-0002-test", LODASH_OTHER_CVE, {
    lodash: { ecosystem: "npm", ranges: [["0", "4.17.12"]] },
  });
  // Fixed only in the next major.
  await advisory(knowledge, "GHSA-rem-0003-test", MAJOR_ONLY_CVE, {
    express: { ecosystem: "npm", ranges: [["0", "5.0.0"]] },
  });
  await advisory(knowledge, "GHSA-rem-0004-test", QS_CVE, {
    qs: {
      ecosystem: "npm",
      ranges: [
        ["6.0.0", "6.2.4"],
        ["6.5.0", "6.5.3"],
      ],
    },
  });
  await advisory(knowledge, "GHSA-rem-0005-test", NO_FIX_CVE, {
    "left-pad": { ecosystem: "npm", ranges: [["0"]] },
  });
  await advisory(knowledge, "GHSA-rem-0006-test", SYMFONY_CVE, {
    "symfony/http-kernel": {
      ecosystem: "Packagist",
      ranges: [
        ["0", "v5.4.20"],
        ["6.0.0", "v6.2.6"],
      ],
    },
  });
}

interface ResolvedInstance {
  vulnerability_id: string;
  package: string;
  installed_version: string;
  workspace: string;
}

interface Remediation {
  kind: string;
  workspace: string;
  package: string;
  installed_versions: string[];
  target_version: string;
  potentially_breaking: boolean;
  dev: boolean;
  package_manager: string | null;
  command: string | null;
  manifest_edit: { file: string; text: string } | null;
  instances: ResolvedInstance[];
}

interface AffectedProject {
  project_id: string;
  project_name: string;
  instances: { instance_id: string; package: string }[];
  remediations: Remediation[];
}

describe("Remediations (e2e)", () => {
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
      email: "admin@remediations.com",
      role: MemberRole.ADMIN,
    });
    seed = new VulnerabilityInstanceFixtures(user);
  });

  // The affected projects of one vulnerability's page.
  const projects = async (id: string): Promise<AffectedProject[]> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${user.organization.id}/vulnerabilities/${id}`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return (response.json().data as { projects: AffectedProject[] }).projects;
  };
  const remediationsOf = async (id: string): Promise<Remediation[]> =>
    (await projects(id)).flatMap((p) => p.remediations);

  const finding = (
    id: string,
    pkg: string,
    version: string,
    extra: Partial<FindingFixture> = {},
  ): FindingFixture => ({ id, dependency: pkg, version, score: 7.5, ...extra });

  it("upgrades a direct dependency to the smallest fixed version in its major", async () => {
    const project = await seed.project("api");
    await seed.analysis({
      projectId: project,
      workspaces: {
        ".": {
          topLevel: ["lodash@4.17.15"],
          findings: [finding(LODASH_CVE, "lodash", "4.17.15")],
        },
      },
    });
    await seed.store();

    expect(await remediationsOf(LODASH_CVE)).toEqual([
      {
        kind: "upgrade_direct",
        workspace: ".",
        package: "lodash",
        installed_versions: ["4.17.15"],
        target_version: "4.17.21",
        potentially_breaking: false,
        dev: false,
        package_manager: "npm",
        command: "npm install lodash@^4.17.21",
        manifest_edit: null,
        instances: [
          expect.objectContaining({
            vulnerability_id: LODASH_CVE,
            package: "lodash",
            installed_version: "4.17.15",
            workspace: ".",
          }),
        ],
      },
    ]);
  });
  it("upgrades to the smallest fix of a later major when its own has none, as potentially breaking", async () => {
    const project = await seed.project("web");
    await seed.analysis({
      projectId: project,
      packageManager: "YARN",
      workspaces: {
        ".": {
          devTopLevel: ["express@4.18.0"],
          devOnly: ["express"],
          findings: [finding(MAJOR_ONLY_CVE, "express", "4.18.0")],
        },
      },
    });
    await seed.store();

    expect(await remediationsOf(MAJOR_ONLY_CVE)).toEqual([
      expect.objectContaining({
        kind: "upgrade_direct",
        package: "express",
        target_version: "5.0.0",
        potentially_breaking: true,
        dev: true,
        package_manager: "yarn",
        command: "yarn add --dev express@^5.0.0",
      }),
    ]);
  });

  it("groups every instance one upgrade resolves in the project, whichever vulnerability's page shows it", async () => {
    const project = await seed.project("api");
    await seed.analysis({
      projectId: project,
      workspaces: {
        ".": {
          topLevel: ["lodash@4.17.10"],
          findings: [
            finding(LODASH_CVE, "lodash", "4.17.10", { score: 9.8 }),
            finding(LODASH_OTHER_CVE, "lodash", "4.17.10", { score: 5 }),
          ],
        },
      },
    });
    await seed.store();

    const expected = [
      expect.objectContaining({
        kind: "upgrade_direct",
        package: "lodash",
        // 4.17.12 fixes one; only 4.17.21 fixes both.
        target_version: "4.17.21",
        command: "npm install lodash@^4.17.21",
        instances: [
          expect.objectContaining({ vulnerability_id: LODASH_CVE }),
          expect.objectContaining({ vulnerability_id: LODASH_OTHER_CVE }),
        ],
      }),
    ];
    expect(await remediationsOf(LODASH_OTHER_CVE)).toEqual(expected);
    expect(await remediationsOf(LODASH_CVE)).toEqual(expected);
  });

  // Analyses from before js-patching was removed keep their patching result rows.
  it("forces a fixed version when an old patching result upgrades a top-level dependency", async () => {
    const project = await seed.project("api");
    await seed.analysis({
      projectId: project,
      packageManager: "PNPM",
      workspaces: {
        ".": {
          topLevel: ["body-parser@1.19.0"],
          packages: { "body-parser@1.19.0": ["qs@6.5.1"] },
          findings: [finding(QS_CVE, "qs", "6.5.1")],
        },
      },
      patching: {
        ".": {
          patches: {
            "body-parser@1.19.0": {
              update: "1.20.2",
              fixes: [{ id: QS_CVE, package: "qs@6.5.1" }],
            },
          },
        },
      },
    });
    await seed.store();

    expect(await remediationsOf(QS_CVE)).toEqual([
      expect.objectContaining({
        kind: "force_version",
        package: "qs",
        installed_versions: ["6.5.1"],
        target_version: "6.5.3",
        package_manager: "pnpm",
        instances: [
          expect.objectContaining({
            package: "qs",
            installed_version: "6.5.1",
          }),
        ],
      }),
    ]);
  });

  it.each([
    ["NPM", "npm pkg set 'overrides[qs]=6.5.3' && npm install", null],
    ["YARN", "npm pkg set 'resolutions[qs]=6.5.3' && yarn install", null],
    [
      "PNPM",
      "pnpm install",
      { file: "pnpm-workspace.yaml", text: 'overrides:\n  "qs": "6.5.3"\n' },
    ],
  ])(
    "forces the fixed version of a transitive package (%s)",
    async (packageManager, command, manifestEdit) => {
      const project = await seed.project("api");
      await seed.analysis({
        projectId: project,
        packageManager,
        workspaces: {
          ".": {
            topLevel: ["body-parser@1.19.0", "express@4.18.0"],
            packages: {
              "body-parser@1.19.0": ["qs@6.5.1"],
              "express@4.18.0": ["qs@6.5.1"],
            },
            findings: [finding(QS_CVE, "qs", "6.5.1")],
          },
        },
      });
      await seed.store();

      expect(await remediationsOf(QS_CVE)).toEqual([
        expect.objectContaining({
          kind: "force_version",
          package: "qs",
          installed_versions: ["6.5.1"],
          target_version: "6.5.3",
          potentially_breaking: false,
          command,
          manifest_edit: manifestEdit,
        }),
      ]);
    },
  );

  it("upgrades a direct composer package and updates a transitive one with its dependencies", async () => {
    const direct = await seed.project("shop");
    const transitive = await seed.project("blog");
    await seed.analysis({
      projectId: direct,
      sbomPlugin: "php-sbom",
      packageManager: "composer",
      workspaces: {
        ".": {
          topLevel: ["symfony/http-kernel@5.4.1"],
          findings: [
            finding(SYMFONY_CVE, "symfony/http-kernel", "5.4.1", {
              ecosystem: "Packagist",
            }),
          ],
        },
      },
    });
    await seed.analysis({
      projectId: transitive,
      sbomPlugin: "php-sbom",
      packageManager: "composer",
      workspaces: {
        ".": {
          topLevel: ["laravel/framework@9.0.0"],
          packages: {
            "laravel/framework@9.0.0": ["symfony/http-kernel@6.1.0"],
          },
          findings: [
            finding(SYMFONY_CVE, "symfony/http-kernel", "6.1.0", {
              ecosystem: "Packagist",
            }),
          ],
        },
      },
    });
    await seed.store();

    const byProject = Object.fromEntries(
      (await projects(SYMFONY_CVE)).map((p) => [
        p.project_name,
        p.remediations,
      ]),
    );
    expect(byProject).toEqual({
      shop: [
        expect.objectContaining({
          kind: "upgrade_direct",
          target_version: "5.4.20",
          package_manager: "composer",
          command: "composer require symfony/http-kernel:^5.4.20",
        }),
      ],
      blog: [
        expect.objectContaining({
          kind: "force_version",
          target_version: "6.2.6",
          package_manager: "composer",
          command: "composer update symfony/http-kernel --with-dependencies",
        }),
      ],
    });
  });

  it("runs the upgrade in the instance's workspace", async () => {
    const project = await seed.project("monorepo");
    await seed.analysis({
      projectId: project,
      workspaces: {
        "packages/web": {
          topLevel: ["lodash@3.9.0"],
          findings: [finding(LODASH_CVE, "lodash", "3.9.0")],
        },
      },
    });
    await seed.store();

    expect(await remediationsOf(LODASH_CVE)).toEqual([
      expect.objectContaining({
        workspace: "packages/web",
        target_version: "3.10.2",
        command: "npm install lodash@^3.10.2 --workspace packages/web",
      }),
    ]);
  });

  it("falls back to the stored fixed version when the knowledge sources give no ranges", async () => {
    const project = await seed.project("api");
    await seed.analysis({
      projectId: project,
      workspaces: {
        ".": {
          topLevel: ["minimist@1.2.0"],
          findings: [
            finding("CVE-2099-3999", "minimist", "1.2.0", {
              ranges: [{ source: "NVD", fixed: "1.2.6" }],
            }),
          ],
        },
      },
    });
    await seed.store();

    expect(await remediationsOf("CVE-2099-3999")).toEqual([
      expect.objectContaining({
        kind: "upgrade_direct",
        target_version: "1.2.6",
        command: "npm install minimist@^1.2.6",
      }),
    ]);
  });

  it("offers no remediation when no fixed version exists", async () => {
    const project = await seed.project("api");
    await seed.analysis({
      projectId: project,
      workspaces: {
        ".": {
          topLevel: ["left-pad@1.3.0"],
          findings: [finding(NO_FIX_CVE, "left-pad", "1.3.0")],
        },
      },
    });
    await seed.store();

    const [affected] = await projects(NO_FIX_CVE);
    expect(affected!.instances).toHaveLength(1);
    expect(affected!.remediations).toEqual([]);
    const planned = await testHelper
      .getApp()
      .get(RemediationsService)
      .forProject(user.organization.id, project);
    expect(planned?.unremediated).toEqual([
      expect.objectContaining({
        instance_id: affected!.instances[0]!.instance_id,
        vulnerability_id: NO_FIX_CVE,
      }),
    ]);
  });

  it("lists as having a fix exactly the instances that get a remediation", async () => {
    const project = await seed.project("api");
    await seed.analysis({
      projectId: project,
      workspaces: {
        ".": {
          topLevel: ["lodash@4.17.15", "left-pad@1.3.0"],
          findings: [
            // Fixed by the knowledge ranges, though the matched source named no fix.
            finding(LODASH_CVE, "lodash", "4.17.15"),
            // The source names a fix that the knowledge ranges still cover.
            finding(NO_FIX_CVE, "left-pad", "1.3.0", {
              ranges: [{ source: "NVD", fixed: "2.0.0" }],
            }),
          ],
        },
      },
    });
    await seed.store();
    const ids = async (fix: string): Promise<string[]> => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${user.organization.id}/vulnerabilities?fix=${fix}`,
        user.accessToken,
      );
      expect(response.statusCode).toBe(200);
      return (response.json().data as { vulnerability_id: string }[])
        .map((row) => row.vulnerability_id)
        .sort();
    };

    expect(await ids("available")).toEqual([LODASH_CVE]);
    expect(await ids("none")).toEqual([NO_FIX_CVE]);
    const planned = await testHelper
      .getApp()
      .get(RemediationsService)
      .forProject(user.organization.id, project);
    expect(
      planned?.remediations
        .flatMap((r) => r.instances.map((i) => i.vulnerability_id))
        .sort(),
    ).toEqual([LODASH_CVE]);
    expect(planned?.unremediated.map((i) => i.vulnerability_id)).toEqual([
      NO_FIX_CVE,
    ]);
  });

  it("lists the remediations of every project in the organization", async () => {
    const api = await seed.project("api");
    const web = await seed.project("web");
    for (const projectId of [api, web]) {
      await seed.analysis({
        projectId,
        workspaces: {
          ".": {
            topLevel: ["lodash@4.17.15"],
            findings: [finding(LODASH_CVE, "lodash", "4.17.15")],
          },
        },
      });
    }
    await seed.store();

    const planned = await testHelper
      .getApp()
      .get(RemediationsService)
      .forOrganization(user.organization.id);
    expect(
      planned
        .map((p) => ({
          project: p.project_id,
          remediations: p.remediations.map((r) => r.command),
        }))
        .sort((a, b) => a.project.localeCompare(b.project)),
    ).toEqual(
      [api, web]
        .map((project) => ({
          project,
          remediations: ["npm install lodash@^4.17.21"],
        }))
        .sort((a, b) => a.project.localeCompare(b.project)),
    );
  });
});
