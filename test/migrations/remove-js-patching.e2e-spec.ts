import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { RemoveJsPatchingFromAnalyzers1796256000000 as AnalyzersMigration } from "../../src/migrations/codeclarity/1796256000000-RemoveJsPatchingFromAnalyzers";
import { CreatePluginsBetaBaseline1796200000000 as PluginsBaseline } from "../../src/migrations/plugins/1796200000000-CreatePluginsBetaBaseline";
import { RemoveJsPatchingPlugin1796256000000 as PluginsMigration } from "../../src/migrations/plugins/1796256000000-RemoveJsPatchingPlugin";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const suffix = `${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = join(__dirname, "../../src/migrations/codeclarity");

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

function dataSource(
  database: string,
  migrations: (new () => MigrationInterface)[] = [],
): DataSource {
  return new DataSource({
    type: "postgres",
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
    database,
    migrations,
    extra: { max: 1 },
  });
}

// Every codeclarity migration class before this one, oldest first.
function earlierMigrations(): (new () => MigrationInterface)[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".ts") && file < "1796256000000")
    .sort()
    .map(
      (file) =>
        Object.values(
          require(join(MIGRATIONS_DIR, file)) as Record<
            string,
            new () => MigrationInterface
          >,
        )[0]!,
    );
}

const step = (name: string): object => ({ name, version: "v1", config: {} });

describe("RemoveJsPatchingFromAnalyzers migration", () => {
  const database = `test_rm_js_patching_${suffix}`;
  let source: DataSource;

  const run = async (direction: "up" | "down"): Promise<void> => {
    const runner = source.createQueryRunner();
    await new AnalyzersMigration()[direction](runner);
    await runner.release();
  };
  const insert = async (
    steps: unknown,
    languageConfig: unknown = null,
  ): Promise<string> => {
    const [row] = await source.query(
      `INSERT INTO analyzer (name, global, description, created_on, steps, language_config)
       VALUES ('a', false, 'd', now(), $1, $2) RETURNING id`,
      [
        JSON.stringify(steps),
        languageConfig === null ? null : JSON.stringify(languageConfig),
      ],
    );
    return row.id;
  };
  const analyzer = async (
    id: string,
  ): Promise<{ steps: unknown; language_config: unknown }> =>
    (
      await source.query(
        `SELECT steps, language_config FROM analyzer WHERE id = $1`,
        [id],
      )
    )[0];

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    source = dataSource(database, earlierMigrations());
    await source.initialize();
    await source.runMigrations();
  }, 60000);

  afterAll(async () => {
    await source.destroy();
    await admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  beforeEach(async () => {
    await source.query(`DELETE FROM analyzer`);
  });

  it("drops js-patching steps, and stages it leaves empty", async () => {
    const id = await insert(
      [
        [step("js-sbom")],
        [step("vuln-finder")],
        [step("license-finder"), step("js-patching")],
        [step("js-patching")],
        [step("codeql")],
      ],
      {
        javascript: {
          plugins: ["js-sbom", "vuln-finder", "js-patching", "license-finder"],
        },
        php: { plugins: ["php-sbom", "vuln-finder"] },
      },
    );

    await run("up");

    expect(await analyzer(id)).toEqual({
      steps: [
        [step("js-sbom")],
        [step("vuln-finder")],
        [step("license-finder")],
        [step("codeql")],
      ],
      language_config: {
        javascript: { plugins: ["js-sbom", "vuln-finder", "license-finder"] },
        php: { plugins: ["php-sbom", "vuln-finder"] },
      },
    });
  });

  it("leaves analyzers without js-patching unchanged, and down does nothing", async () => {
    const steps = [[step("js-sbom")], [step("vuln-finder")]];
    const plain = await insert(steps);
    const patched = await insert([[step("js-sbom")], [step("js-patching")]]);

    await run("up");
    await run("up");
    await run("down");

    expect(await analyzer(plain)).toEqual({ steps, language_config: null });
    expect((await analyzer(patched)).steps).toEqual([[step("js-sbom")]]);
  });
});

describe("RemoveJsPatchingPlugin migration", () => {
  const database = `test_rm_js_patching_plugin_${suffix}`;
  let plugins: DataSource;

  const run = async (
    direction: "up" | "down",
    migration: MigrationInterface,
  ): Promise<void> => {
    const runner = plugins.createQueryRunner();
    await migration[direction](runner);
    await runner.release();
  };
  const addPlugin = (name: string): Promise<unknown> =>
    plugins.query(
      `INSERT INTO plugin (name, version, description, depends_on, config) VALUES ($1, 'v1', $1, '[]', '{}')`,
      [name],
    );

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    plugins = dataSource(database);
    await plugins.initialize();
    await plugins.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await run("up", new PluginsBaseline());
  });

  afterAll(async () => {
    await plugins.destroy();
    await admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  it("removes the js-patching registry row and keeps the others", async () => {
    await addPlugin("js-sbom");
    await addPlugin("js-patching");
    await addPlugin("vuln-finder");

    await run("up", new PluginsMigration());
    await run("up", new PluginsMigration());

    expect(
      await plugins.query(`SELECT name FROM plugin ORDER BY name`),
    ).toEqual([{ name: "js-sbom" }, { name: "vuln-finder" }]);
  });
});
