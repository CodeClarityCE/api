import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { CreateConfigBaseline1754600000000 as ConfigBaseline } from "../../src/migrations/config/1754600000000-CreateConfigBaseline";
import { CreateKnowledgeBaseline1754600000000 as KnowledgeBaseline } from "../../src/migrations/knowledge/1754600000000-CreateKnowledgeBaseline";
import { CreateKnowledgeSourceSync1794182400000 as SourceSync } from "../../src/migrations/knowledge/1794182400000-CreateKnowledgeSourceSync";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const suffix = `${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = join(__dirname, "../../src/migrations");
const FIXTURES_DIR = join(__dirname, "fixtures");

// Tables the knowledge services read or write once every migration has run.
const KNOWLEDGE_TABLES = [
  "cwe",
  "epss",
  "friends_of_php",
  "gcve",
  "knowledge_date_conversion_issue",
  "knowledge_dated_restore",
  "knowledge_source_sync",
  "licenses",
  "migrations",
  "nvd",
  "osv",
  "package",
  "package_vulnerability",
  "version",
];

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

// Every migration class in one API migrations folder, oldest first.
function migrationsIn(folder: "knowledge" | "config"): MigrationClass[] {
  return readdirSync(join(MIGRATIONS_DIR, folder))
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map((file) => {
      const exported = require(join(MIGRATIONS_DIR, folder, file)) as Record<
        string,
        MigrationClass
      >;
      return Object.values(exported)[0] as MigrationClass;
    });
}

// A pair of scratch knowledge and config databases, migrated like the API does.
class Install {
  readonly knowledge: string;
  readonly config: string;

  constructor(name: string) {
    this.knowledge = `test_baseline_${name}_knowledge_${suffix}`;
    this.config = `test_baseline_${name}_config_${suffix}`;
  }

  async create(): Promise<void> {
    await admin(`CREATE DATABASE ${this.knowledge}`);
    await admin(`CREATE DATABASE ${this.config}`);
  }

  async drop(): Promise<void> {
    await admin(`DROP DATABASE IF EXISTS ${this.knowledge} WITH (FORCE)`);
    await admin(`DROP DATABASE IF EXISTS ${this.config} WITH (FORCE)`);
  }

  // Same result as pg_restore of the 2025-05-27 knowledge and config dumps, without their data.
  async restoreOldDump(): Promise<void> {
    await query(
      this.knowledge,
      readFileSync(join(FIXTURES_DIR, "knowledge-dump-2025-05-27.sql"), "utf8"),
    );
    await query(
      this.config,
      readFileSync(join(FIXTURES_DIR, "config-dump-2025-05-27.sql"), "utf8"),
    );
  }

  // Knowledge first, then config, as run-migrations.ts does.
  async migrate(
    keep: (migration: MigrationClass) => boolean = () => true,
  ): Promise<void> {
    const configDb = this.config;
    class ScratchSourceSync extends SourceSync {
      constructor() {
        super(configDb);
      }
    }
    const knowledge = migrationsIn("knowledge")
      .filter(keep)
      .map((migration) =>
        migration === SourceSync ? ScratchSourceSync : migration,
      );
    await this.run(this.knowledge, knowledge);
    await this.run(this.config, migrationsIn("config").filter(keep));
  }

  async runOnce(
    database: string,
    migration: MigrationInterface,
  ): Promise<void> {
    const source = this.dataSource(database, []);
    await source.initialize();
    const runner = source.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
      await source.destroy();
    }
  }

  async executed(database: string): Promise<string[]> {
    const rows = await query<{ name: string }>(
      database,
      `SELECT name FROM migrations ORDER BY name`,
    );
    return rows.map((row) => row.name);
  }

  private async run(
    database: string,
    migrations: MigrationClass[],
  ): Promise<void> {
    const source = this.dataSource(database, migrations);
    await source.initialize();
    try {
      await source.runMigrations();
    } finally {
      await source.destroy();
    }
  }

  private dataSource(
    database: string,
    migrations: MigrationClass[],
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

// Rows the baseline could touch: the config row and the source sync state.
async function state(install: Install): Promise<unknown> {
  return {
    config: await query(install.config, `SELECT * FROM config ORDER BY id`),
    sync: await query(
      install.knowledge,
      `SELECT * FROM knowledge_source_sync ORDER BY source`,
    ),
  };
}

describe("Knowledge and config baseline migrations", () => {
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

  it("builds every base table and one config row from empty databases", async () => {
    const fresh = await install("empty");

    await fresh.migrate();

    expect(await tables(fresh.knowledge)).toEqual(KNOWLEDGE_TABLES);
    expect(await tables(fresh.config)).toEqual(["config", "migrations"]);
    const config = await query(
      fresh.config,
      `SELECT nvd_last, npm_last, gcve_last, osv_last FROM config`,
    );
    expect(config).toEqual([
      { nvd_last: null, npm_last: null, gcve_last: null, osv_last: null },
    ]);
  }, 60000);

  it("starts every source watermark at null on an empty config", async () => {
    const fresh = await install("watermarks");

    await fresh.migrate();

    const sync = await query<{ source: string; watermark: Date | null }>(
      fresh.knowledge,
      `SELECT source, watermark FROM knowledge_source_sync ORDER BY source`,
    );
    expect(sync).toEqual(
      ["cwe", "epss", "friends_of_php", "gcve", "licenses", "nvd", "osv"].map(
        (source) => ({ source, watermark: null }),
      ),
    );
  }, 60000);

  it("starts every source with no recorded upstream total", async () => {
    const fresh = await install("totals");

    await fresh.migrate();

    const sync = await query<{ source: string; upstream_total: string | null }>(
      fresh.knowledge,
      `SELECT source, upstream_total FROM knowledge_source_sync ORDER BY source`,
    );
    expect(sync).toEqual(
      ["cwe", "epss", "friends_of_php", "gcve", "licenses", "nvd", "osv"].map(
        (source) => ({ source, upstream_total: null }),
      ),
    );
  }, 60000);

  it("creates the advisory JSON lookup indexes", async () => {
    const fresh = await install("gin");

    await fresh.migrate();

    const indexes = await query(
      fresh.knowledge,
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('nvd_affectedflattened_gin_pathops_idx', 'osv_affected_gin_pathops_idx')
       ORDER BY indexname`,
    );
    expect(indexes).toEqual([
      {
        indexname: "nvd_affectedflattened_gin_pathops_idx",
        indexdef:
          'CREATE INDEX nvd_affectedflattened_gin_pathops_idx ON public.nvd USING gin ("affectedFlattened" jsonb_path_ops)',
      },
      {
        indexname: "osv_affected_gin_pathops_idx",
        indexdef:
          "CREATE INDEX osv_affected_gin_pathops_idx ON public.osv USING gin (affected jsonb_path_ops)",
      },
    ]);
  }, 60000);

  it("stores a FriendsOfPHP advisory with no published or modified date", async () => {
    const fresh = await install("fop_dates");

    await fresh.migrate();

    // The repository gives no modified date, and some advisories have no branch time.
    await query(
      fresh.knowledge,
      `INSERT INTO friends_of_php (advisory_id, title, link, reference)
       VALUES ('twig/twig/2024-01-01', 'Sandbox bypass', '', 'composer://twig/twig')`,
    );
    const rows = await query(
      fresh.knowledge,
      `SELECT published, modified FROM friends_of_php`,
    );
    expect(rows).toEqual([{ published: null, modified: null }]);
  }, 60000);

  it("matches the schema of the old dump restored and then migrated", async () => {
    const fresh = await install("fresh");
    const restored = await install("restored");
    await restored.restoreOldDump();

    await fresh.migrate();
    await restored.migrate();

    expect(await schema(fresh.knowledge)).toEqual(
      await schema(restored.knowledge),
    );
    expect(await schema(fresh.config)).toEqual(await schema(restored.config));
  }, 60000);

  it("only records the baselines on an already-migrated database", async () => {
    const existing = await install("upgrade");
    await existing.restoreOldDump();
    const isBaseline = (migration: MigrationClass): boolean =>
      migration === KnowledgeBaseline || migration === ConfigBaseline;
    await existing.migrate((migration) => !isBaseline(migration));
    const knowledgeBefore = await schema(existing.knowledge);
    const configBefore = await schema(existing.config);
    const stateBefore = await state(existing);
    const executedBefore = await existing.executed(existing.knowledge);

    await existing.migrate();

    expect(await schema(existing.knowledge)).toEqual(knowledgeBefore);
    expect(await schema(existing.config)).toEqual(configBefore);
    expect(await state(existing)).toEqual(stateBefore);
    expect(await existing.executed(existing.knowledge)).toEqual(
      [...executedBefore, "CreateKnowledgeBaseline1754600000000"].sort(),
    );
    expect(await existing.executed(existing.config)).toContain(
      "CreateConfigBaseline1754600000000",
    );
  }, 60000);

  it("changes nothing when the baseline runs again", async () => {
    const fresh = await install("again");
    await fresh.migrate();
    const knowledgeBefore = await schema(fresh.knowledge);
    const configBefore = await schema(fresh.config);
    const stateBefore = await state(fresh);

    await fresh.runOnce(fresh.knowledge, new KnowledgeBaseline());
    await fresh.runOnce(fresh.config, new ConfigBaseline());

    expect(await schema(fresh.knowledge)).toEqual(knowledgeBefore);
    expect(await schema(fresh.config)).toEqual(configBefore);
    expect(await state(fresh)).toEqual(stateBefore);
  }, 60000);
});
