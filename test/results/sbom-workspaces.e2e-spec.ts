import { randomUUID } from "crypto";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";

import { Result } from "../../src/codeclarity_modules/results/result.entity";
import { SBOMService } from "../../src/codeclarity_modules/results/sbom/sbom.service";
import { SbomUtilsService } from "../../src/codeclarity_modules/results/sbom/utils/utils";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_sbom_workspaces_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

const workspace = () => ({
  dependencies: {},
  start: { dependencies: [], dev_dependencies: [] },
});

// An SBOM plugin output with the given workspaces and package manager.
const sbom = (packageManager: string, workspaces: string[]) => ({
  workspaces: Object.fromEntries(workspaces.map((w) => [w, workspace()])),
  analysis_info: {
    status: "success",
    project_name: "sample",
    package_manager: packageManager,
  },
});

describe("Workspaces of an SBOM", () => {
  let data: DataSource;
  let service: SBOMService;

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    const root = join(__dirname, "../../src");
    data = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      entities: [
        join(root, "base_modules/**/*.entity.ts"),
        join(root, "codeclarity_modules/**/*.entity.ts"),
      ],
      extra: { max: 2 },
    });
    await data.initialize();
    const columns = data
      .getMetadata("Analysis")
      .columns.map((c) => `"${c.databaseName}" text`)
      .filter((c) => !/^"(id|created_on)"/.test(c))
      .join(", ");
    await data.query(`
      CREATE TABLE analysis (id uuid PRIMARY KEY, created_on timestamp NOT NULL DEFAULT now(), ${columns});
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE result (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), result jsonb NOT NULL,
        plugin varchar NOT NULL, created_on timestamp NOT NULL DEFAULT now(), "analysisId" uuid
      );
    `);
    const utils = new SbomUtilsService(
      undefined as never,
      undefined as never,
      data.getRepository(Result),
    );
    // Access checks are covered elsewhere; here every user may read.
    const access = { checkAccess: async () => undefined };
    service = new SBOMService(access as never, utils, undefined as never);
  });

  afterAll(async () => {
    await data.destroy();
    await admin(`DROP DATABASE ${database} WITH (FORCE)`);
  });

  const analysisWith = async (
    results: Record<string, ReturnType<typeof sbom>>,
  ): Promise<string> => {
    const analysisId = randomUUID();
    await data.query(`INSERT INTO analysis (id) VALUES ($1)`, [analysisId]);
    for (const [plugin, output] of Object.entries(results)) {
      await data.query(
        `INSERT INTO result (result, plugin, "analysisId") VALUES ($1, $2, $3)`,
        [JSON.stringify(output), plugin, analysisId],
      );
    }
    return analysisId;
  };

  const workspacesOf = (analysisId: string) =>
    service.getWorkspaces("org", "project", analysisId, undefined as never);

  it.each(["NPM", "YARN", "PNPM"])(
    "reports %s for a JavaScript project",
    async (manager) => {
      const analysisId = await analysisWith({
        "js-sbom": sbom(manager, [".", "packages/app"]),
      });

      const result = await workspacesOf(analysisId);

      expect(result.package_manager).toBe(manager);
      expect(result.package_managers).toEqual({
        ".": manager,
        "packages/app": manager,
      });
    },
  );

  it("reports composer for a PHP project", async () => {
    const analysisId = await analysisWith({
      "php-sbom": sbom("composer", ["."]),
    });

    const result = await workspacesOf(analysisId);

    expect(result.package_manager).toBe("composer");
    expect(result.package_managers).toEqual({ ".": "composer" });
  });

  it("reports each workspace's manager when languages are mixed", async () => {
    const analysisId = await analysisWith({
      "js-sbom": sbom("YARN", ["frontend"]),
      "php-sbom": sbom("composer", ["."]),
    });

    const result = await workspacesOf(analysisId);

    expect(result.package_manager).toBe("multi-language");
    expect(result.package_managers).toEqual({
      frontend: "YARN",
      ".": "composer",
    });
  });

  it("reports a shared workspace as multi-language", async () => {
    const analysisId = await analysisWith({
      "js-sbom": sbom("NPM", ["."]),
      "php-sbom": sbom("composer", ["."]),
    });

    const result = await workspacesOf(analysisId);

    expect(result.package_managers).toEqual({ ".": "multi-language" });
  });
});
