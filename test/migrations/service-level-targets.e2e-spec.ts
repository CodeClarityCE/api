import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { AddServiceLevelTargetsToOrg1796083200000 as Migration } from "../../src/migrations/codeclarity/1796083200000-AddServiceLevelTargetsToOrg";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_service_level_targets_${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = join(__dirname, "../../src/migrations/codeclarity");
const ROOT = join(__dirname, "../..");

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

// Every codeclarity migration class, oldest first.
function migrations(): (new () => MigrationInterface)[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".ts"))
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

describe("AddServiceLevelTargetsToOrg migration", () => {
  let source: DataSource;

  const run = async (step: "up" | "down"): Promise<void> => {
    const runner = source.createQueryRunner();
    await new Migration()[step](runner);
    await runner.release();
  };

  // Schema changes the entities still want after the migrations, for this migration's objects.
  const drift = async (): Promise<string[]> => {
    const entities = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      entities: [
        join(ROOT, "src/base_modules/!(plugins)/**/*.entity.ts"),
        join(ROOT, "src/codeclarity_modules/!(knowledge)/**/*.entity.ts"),
      ],
    });
    await entities.initialize();
    try {
      const log = await entities.driver.createSchemaBuilder().log();
      return log.upQueries
        .map((q) => q.query)
        .filter((q) => /service_level_targets/.test(q));
    } finally {
      await entities.destroy();
    }
  };

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    source = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      migrations: migrations(),
      extra: { max: 1 },
    });
    await source.initialize();
    await source.runMigrations();
  }, 60000);

  afterAll(async () => {
    await source.destroy();
    await admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  it("builds the schema the entities describe, off with the suggested days", async () => {
    expect(await drift()).toEqual([]);
    await source.query(
      `INSERT INTO organization (name, description, color_scheme, created_on, personal)
       VALUES ('acme', '', '1', now(), false)`,
    );
    const [org] = await source.query(
      `SELECT service_level_targets_enabled, service_level_targets FROM organization`,
    );
    expect(org).toEqual({
      service_level_targets_enabled: false,
      service_level_targets: { critical: 7, high: 30, medium: 90, low: null },
    });
  }, 60000);

  it("reverts cleanly and applies again", async () => {
    await run("down");
    const columns = await source.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'organization' AND column_name LIKE 'service_level_targets%'`,
    );
    expect(columns).toHaveLength(0);

    await run("up");
    expect(await drift()).toEqual([]);
  }, 60000);
});
