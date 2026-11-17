import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { WidenServiceDomain1795219200000 as Migration } from "../../src/migrations/codeclarity/1795219200000-WidenServiceDomain";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_widen_service_domain_${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = join(__dirname, "../../src/migrations/codeclarity");

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

describe("WidenServiceDomain migration", () => {
  let source: DataSource;

  const run = async (step: "up" | "down"): Promise<void> => {
    const runner = source.createQueryRunner();
    await new Migration()[step](runner);
    await runner.release();
  };

  // character_maximum_length of service_domain per table.
  const lengths = async (): Promise<Record<string, number | null>> => {
    const rows: { table_name: string; length: number | null }[] =
      await source.query(
        `SELECT table_name, character_maximum_length AS length
         FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'service_domain'`,
      );
    return Object.fromEntries(rows.map((r) => [r.table_name, r.length]));
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

  it("widens integration and project to 255 and leaves repository_cache alone", async () => {
    expect(await lengths()).toEqual({
      integration: 255,
      project: 255,
      repository_cache: null,
    });
  });

  it("restores the previous lengths on down, and widens again on up", async () => {
    await run("down");
    expect(await lengths()).toEqual({
      integration: 25,
      project: 100,
      repository_cache: null,
    });

    await run("up");
    expect(await lengths()).toEqual({
      integration: 255,
      project: 255,
      repository_cache: null,
    });
  });
});
