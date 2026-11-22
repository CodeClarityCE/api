import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { DataSource, type MigrationInterface } from "typeorm";

import { CreateCodeclarityBetaBaseline1796200000000 } from "../../src/migrations/codeclarity/1796200000000-CreateCodeclarityBetaBaseline";
import { CreateConfigBetaBaseline1796200000000 } from "../../src/migrations/config/1796200000000-CreateConfigBetaBaseline";
import { CreateKnowledgeBetaBaseline1796200000000 } from "../../src/migrations/knowledge/1796200000000-CreateKnowledgeBetaBaseline";
import { CreatePluginsBetaBaseline1796200000000 } from "../../src/migrations/plugins/1796200000000-CreatePluginsBetaBaseline";

import { connection, query, schemaSnapshot } from "./schema-snapshot";

type MigrationClass = new () => MigrationInterface;

// Fixtures recorded from a fresh v0.0.57-alpha install by snapshot-last-alpha.ts.
const FIXTURES = join(__dirname, "fixtures/last-alpha");
const suffix = `${process.pid}_${Date.now()}`;

const BASELINES: [string, MigrationClass][] = [
  ["codeclarity", CreateCodeclarityBetaBaseline1796200000000],
  ["knowledge", CreateKnowledgeBetaBaseline1796200000000],
  ["plugins", CreatePluginsBetaBaseline1796200000000],
  ["config", CreateConfigBetaBaseline1796200000000],
];

// Every migration class of a database, oldest first.
function migrations(db: string): MigrationClass[] {
  const dir = join(__dirname, "../../src/migrations", db);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map(
      (file) =>
        Object.values(
          require(join(dir, file)) as Record<string, MigrationClass>,
        )[0]!,
    );
}

async function migrate(
  database: string,
  classes: MigrationClass[],
): Promise<void> {
  const source = new DataSource({
    type: "postgres",
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
    database,
    migrations: classes,
    extra: { max: 1 },
  });
  await source.initialize();
  try {
    await source.runMigrations();
  } finally {
    await source.destroy();
  }
}

async function executed(database: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    database,
    `SELECT name FROM migrations ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

describe.each(BASELINES)("The %s beta baseline", (db, Baseline) => {
  const created: string[] = [];

  // An empty database as the Postgres init script leaves it.
  const install = async (name: string): Promise<string> => {
    const database = `test_beta_baseline_${db}_${name}_${suffix}`;
    created.push(database);
    await query("postgres", `CREATE DATABASE ${database}`);
    await query(database, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    return database;
  };

  // A database the last alpha's migrations built: its schema, from the baseline, and its migrations table.
  const lastAlpha = async (name: string): Promise<string> => {
    const database = await install(name);
    const source = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
    });
    await source.initialize();
    const runner = source.createQueryRunner();
    try {
      await new Baseline().up(runner);
    } finally {
      await runner.release();
      await source.destroy();
    }
    await query(
      database,
      readFileSync(join(FIXTURES, `${db}.migrations.sql`), "utf8"),
    );
    return database;
  };

  afterAll(async () => {
    for (const database of created.splice(0)) {
      await query(
        "postgres",
        `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`,
      );
    }
  });

  it("gives an empty database the schema the last alpha's migrations built", async () => {
    const fresh = await install("fresh");

    await migrate(fresh, [Baseline]);

    const expected = JSON.parse(
      readFileSync(join(FIXTURES, `${db}.schema.json`), "utf8"),
    ) as Record<string, unknown[]>;
    expect(await schemaSnapshot(fresh)).toEqual(expected);
  }, 60000);

  it("takes over a database at the last alpha without changing its schema or data", async () => {
    const fresh = await install("all");
    await migrate(fresh, migrations(db));
    const upgraded = await lastAlpha("upgraded");

    await migrate(upgraded, migrations(db));

    expect(await schemaSnapshot(upgraded)).toEqual(await schemaSnapshot(fresh));
    expect(await executed(upgraded)).toEqual(await executed(fresh));
  }, 60000);

  it("refuses a database an older alpha migrated, and changes nothing", async () => {
    const older = await lastAlpha("older");
    await query(
      older,
      `DELETE FROM migrations WHERE id = (SELECT max(id) FROM migrations)`,
    );
    const before = await schemaSnapshot(older);
    const executedBefore = await executed(older);

    await expect(migrate(older, migrations(db))).rejects.toThrow(
      /older than the last alpha \(deployment v0\.0\.32-alpha, API v0\.0\.57-alpha\)\. Upgrade to the last alpha first/,
    );

    expect(await schemaSnapshot(older)).toEqual(before);
    expect(await executed(older)).toEqual(executedBefore);
  }, 60000);
});
