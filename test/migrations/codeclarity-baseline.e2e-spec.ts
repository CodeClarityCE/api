import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { CreateCodeclarityBaseline1754640000000 as Baseline } from "../../src/migrations/codeclarity/1754640000000-CreateCodeclarityBaseline";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const suffix = `${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = join(__dirname, "../../src/migrations/codeclarity");
const FIXTURE = join(__dirname, "fixtures/codeclarity-dump-2025-05-27.sql");
type MigrationClass = new () => MigrationInterface;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

async function query<T = Record<string, unknown>>(
  database: string,
  sql: string,
): Promise<T[]> {
  const client = new Client({ ...connection, database });
  await client.connect();
  try {
    return (await client.query(sql)).rows as T[];
  } finally {
    await client.end();
  }
}

// Every codeclarity migration class, oldest first.
function migrations(): MigrationClass[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map((file) => {
      const exported = require(join(MIGRATIONS_DIR, file)) as Record<
        string,
        MigrationClass
      >;
      return Object.values(exported)[0] as MigrationClass;
    });
}

function dataSource(
  database: string,
  migrations: MigrationClass[] = [],
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

// A scratch codeclarity database, migrated like the API does.
class Install {
  readonly database: string;

  constructor(name: string) {
    this.database = `test_cc_baseline_${name}_${suffix}`;
  }

  async create(): Promise<void> {
    await admin(`CREATE DATABASE ${this.database}`);
  }

  async drop(): Promise<void> {
    await admin(`DROP DATABASE IF EXISTS ${this.database} WITH (FORCE)`);
  }

  // Same result as pg_restore of the 2025-05-27 codeclarity dump, without its data.
  async restoreOldDump(): Promise<void> {
    await query(this.database, readFileSync(FIXTURE, "utf8"));
  }

  async migrate(
    keep: (migration: MigrationClass) => boolean = () => true,
  ): Promise<void> {
    const source = dataSource(this.database, migrations().filter(keep));
    await source.initialize();
    try {
      await source.runMigrations();
    } finally {
      await source.destroy();
    }
  }

  async runOnce(migration: MigrationInterface): Promise<void> {
    const source = dataSource(this.database);
    await source.initialize();
    const runner = source.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
      await source.destroy();
    }
  }

  async executed(): Promise<string[]> {
    const rows = await query<{ name: string }>(
      this.database,
      `SELECT name FROM migrations ORDER BY name`,
    );
    return rows.map((row) => row.name);
  }
}

// Tables, columns, types, indexes, constraints and extensions of a database.
async function schema(database: string): Promise<Record<string, unknown[]>> {
  return {
    extensions: await query(
      database,
      `SELECT extname FROM pg_extension ORDER BY extname`,
    ),
    columns: await query(
      database,
      `SELECT c.relname AS table, a.attname AS column,
              format_type(a.atttypid, a.atttypmod) AS type,
              a.attnotnull AS not_null, a.attgenerated AS generated,
              pg_get_expr(d.adbin, d.adrelid) AS default
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY c.relname, a.attname`,
    ),
    indexes: await query(
      database,
      `SELECT tablename, indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' ORDER BY tablename, indexname`,
    ),
    constraints: await query(
      database,
      `SELECT conrelid::regclass::text AS table, conname,
              pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace
       ORDER BY conrelid::regclass::text, conname`,
    ),
  };
}

async function tables(database: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    database,
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows.map((row) => row.name);
}

describe("Codeclarity baseline migration", () => {
  const installs: Install[] = [];

  const install = async (name: string): Promise<Install> => {
    const created = new Install(name);
    installs.push(created);
    await created.create();
    return created;
  };

  afterEach(async () => {
    for (const created of installs.splice(0)) {
      await created.drop();
    }
  });

  it("migrates an empty database to the app schema", async () => {
    const fresh = await install("empty");

    await fresh.migrate();

    expect(await tables(fresh.database)).toEqual(
      expect.arrayContaining([
        "analysis",
        "analyzer",
        "organization",
        "organization_memberships",
        "project",
        "user",
      ]),
    );
  }, 60000);

  it("matches the schema of the old dump restored and then migrated", async () => {
    const fresh = await install("fresh");
    const restored = await install("restored");
    await restored.restoreOldDump();

    await fresh.migrate();
    await restored.migrate();

    expect(await schema(fresh.database)).toEqual(
      await schema(restored.database),
    );
  }, 60000);

  it("only records the baseline on an already-migrated database", async () => {
    const existing = await install("upgrade");
    await existing.restoreOldDump();
    await existing.migrate((migration) => migration !== Baseline);
    const before = await schema(existing.database);
    const executedBefore = await existing.executed();

    await existing.migrate();

    expect(await schema(existing.database)).toEqual(before);
    expect(await existing.executed()).toEqual(
      [...executedBefore, "CreateCodeclarityBaseline1754640000000"].sort(),
    );
  }, 60000);

  it("changes nothing when the baseline runs again", async () => {
    const fresh = await install("again");
    await fresh.migrate();
    const before = await schema(fresh.database);

    await fresh.runOnce(new Baseline());

    expect(await schema(fresh.database)).toEqual(before);
  }, 60000);
});
