import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { AddRepositoryCacheProviderId1796385600000 as Migration } from "../../src/migrations/codeclarity/1796385600000-AddRepositoryCacheProviderId";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_repository_cache_provider_id_${process.pid}_${Date.now()}`;
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

describe("Repository cache provider id migration", () => {
  let source: DataSource;

  const run = async (step: "up" | "down"): Promise<void> => {
    const runner = source.createQueryRunner();
    await new Migration()[step](runner);
    await runner.release();
  };

  // Schema changes the entities still want on the repository_cache table after the migrations.
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
        .filter((q) => /"repository_cache"/.test(q));
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

  it("builds the repository_cache table the entity describes", async () => {
    expect(await drift()).toEqual([]);
  }, 60000);

  it("reverts, drops duplicate rows of one repository and applies again", async () => {
    await run("down");
    const columns = await source.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'repository_cache' AND column_name = 'provider_id'`,
    );
    expect(columns).toHaveLength(0);

    const [integration] = await source.query(
      `INSERT INTO "integration" ("integration_type", "integration_provider", "access_token", "invalid", "service_domain", "added_on")
       VALUES ('VCS', 'GITHUB', 'token', false, 'github.com', now()) RETURNING "id"`,
    );
    for (const url of [
      "https://github.com/a/x",
      "https://github.com/a/x",
      "https://github.com/a/y",
    ]) {
      await source.query(
        `INSERT INTO "repository_cache" ("repository_type", "url", "default_branch", "visibility", "fully_qualified_name", "description", "created_at", "integrationId")
         VALUES ('GITHUB', $1, 'main', 'private', $1, '', now(), $2)`,
        [url, integration.id],
      );
    }

    await run("up");

    const rows = await source.query(
      `SELECT "url" FROM "repository_cache" ORDER BY "url"`,
    );
    expect(rows.map((r: { url: string }) => r.url)).toEqual([
      "https://github.com/a/x",
      "https://github.com/a/y",
    ]);
    expect(await drift()).toEqual([]);
  }, 60000);
});
