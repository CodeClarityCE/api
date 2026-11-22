import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { AddOrganizationTokens1796212800000 as Migration } from "../../src/migrations/codeclarity/1796212800000-AddOrganizationTokens";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_organization_tokens_${process.pid}_${Date.now()}`;
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

describe("AddOrganizationTokens migration", () => {
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
        .filter((q) => /organization_token|blame_on/.test(q));
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

  const addTokenLog = async (): Promise<void> => {
    const [org] = await source.query(
      `INSERT INTO organization (name, description, color_scheme, created_on, personal)
       VALUES ('acme', '', '1', now(), false) RETURNING id`,
    );
    await source.query(
      `INSERT INTO log (action_severity, action_class, action, description, created_on, organization_id, blame_on_token_name)
       VALUES (0, 'Organization', 'OrganizationTokenUsed', 'called GET', now(), $1, 'ci-pipeline')`,
      [org.id],
    );
  };

  it("builds the schema the entities describe, with tokens as audit log actors", async () => {
    expect(await drift()).toEqual([]);
    await addTokenLog();
    const [log] = await source.query(`SELECT blame_on_email FROM log`);
    expect(log).toEqual({ blame_on_email: null });
  }, 60000);

  it("reverts cleanly, naming the token where no email was kept, and applies again", async () => {
    await run("down");
    const tables = await source.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_token'`,
    );
    expect(tables).toHaveLength(0);
    const [log] = await source.query(`SELECT blame_on_email FROM log`);
    expect(log).toEqual({ blame_on_email: "Organization token ci-pipeline" });

    await run("up");
    expect(await drift()).toEqual([]);
  }, 60000);
});
