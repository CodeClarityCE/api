import { Client } from "pg";
import { DataSource } from "typeorm";

import { CreateKnowledgeSourceSync1794182400000 as Migration } from "../../src/migrations/knowledge/1794182400000-CreateKnowledgeSourceSync";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const suffix = `${process.pid}_${Date.now()}`;
const knowledgeDb = `test_sync_knowledge_${suffix}`;
const configDb = `test_sync_config_${suffix}`;

const OLD_NVD = "2025-05-27T10:00:00.000Z";
const OLD_GCVE = "2025-05-28T10:00:00.000Z";
const OLD_OSV = "2025-05-29T10:00:00.000Z";
const SOURCES = [
  "cwe",
  "epss",
  "friends_of_php",
  "gcve",
  "licenses",
  "nvd",
  "osv",
];

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

async function onConfig(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: configDb });
  await client.connect();
  await client.query(sql);
  await client.end();
}

interface SyncRow {
  source: string;
  watermark: Date | null;
  last_run_started_at: Date | null;
  last_run_finished_at: Date | null;
  last_outcome: string | null;
  last_error: string | null;
  row_count: string;
}

describe("CreateKnowledgeSourceSync migration", () => {
  let knowledge: DataSource;

  const migrate = async (): Promise<void> => {
    const runner = knowledge.createQueryRunner();
    await new Migration(configDb).up(runner);
    await runner.release();
  };
  const rows = async (): Promise<Record<string, SyncRow>> => {
    const result: SyncRow[] = await knowledge.query(
      `SELECT * FROM knowledge_source_sync`,
    );
    return Object.fromEntries(result.map((row) => [row.source, row]));
  };

  beforeEach(async () => {
    await admin(`CREATE DATABASE ${knowledgeDb}`);
    await admin(`CREATE DATABASE ${configDb}`);
    knowledge = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database: knowledgeDb,
    });
    await knowledge.initialize();
    await knowledge.query(`CREATE TABLE nvd (id int)`);
    await knowledge.query(`INSERT INTO nvd VALUES (1), (2), (3)`);
    await knowledge.query(`CREATE TABLE osv (id int)`);
    await knowledge.query(`INSERT INTO osv VALUES (1)`);
    await onConfig(
      `CREATE TABLE config (id int, nvd_last timestamptz, npm_last varchar, gcve_last timestamptz, osv_last timestamptz)`,
    );
    await onConfig(
      `INSERT INTO config VALUES (1, '${OLD_NVD}', '0', '${OLD_GCVE}', '${OLD_OSV}')`,
    );
  });

  afterEach(async () => {
    await knowledge.destroy();
    await admin(`DROP DATABASE ${knowledgeDb} WITH (FORCE)`);
    await admin(`DROP DATABASE ${configDb} WITH (FORCE)`);
  });

  it("creates one row per knowledge source with watermarks from config", async () => {
    await migrate();
    const sync = await rows();

    expect(Object.keys(sync).sort()).toEqual(SOURCES);
    expect(sync["nvd"]?.watermark?.toISOString()).toBe(OLD_NVD);
    expect(sync["gcve"]?.watermark?.toISOString()).toBe(OLD_GCVE);
    expect(sync["osv"]?.watermark?.toISOString()).toBe(OLD_OSV);
    expect(sync["epss"]?.watermark).toBeNull();
  });

  it("backfills row counts and leaves run fields empty", async () => {
    await migrate();
    const sync = await rows();

    expect(sync["nvd"]?.row_count).toBe("3");
    expect(sync["osv"]?.row_count).toBe("1");
    expect(sync["epss"]?.row_count).toBe("0");
    expect(sync["nvd"]?.last_run_started_at).toBeNull();
    expect(sync["nvd"]?.last_run_finished_at).toBeNull();
    expect(sync["nvd"]?.last_outcome).toBeNull();
    expect(sync["nvd"]?.last_error).toBeNull();
  });

  it("replaces newer rows left behind when an older dump is restored", async () => {
    // pg_restore --clean only drops what the dump contains, so the table survives.
    await migrate();
    await knowledge.query(
      `UPDATE knowledge_source_sync SET watermark = '2026-11-01T00:00:00Z', row_count = 999, last_outcome = 'success' WHERE source = 'nvd'`,
    );

    await migrate();
    const sync = await rows();

    expect(sync["nvd"]?.watermark?.toISOString()).toBe(OLD_NVD);
    expect(sync["nvd"]?.row_count).toBe("3");
    expect(sync["nvd"]?.last_outcome).toBeNull();
  });

  it("handles an older config dump that lacks newer columns", async () => {
    // Knowledge migrations run before config migrations, so columns can be missing.
    await onConfig(
      `ALTER TABLE config DROP COLUMN osv_last, DROP COLUMN gcve_last`,
    );

    await migrate();
    const sync = await rows();

    expect(sync["nvd"]?.watermark?.toISOString()).toBe(OLD_NVD);
    expect(sync["osv"]?.watermark).toBeNull();
    expect(sync["gcve"]?.watermark).toBeNull();
  });

  it("treats Go zero times and a missing config row as no watermark", async () => {
    await onConfig(`UPDATE config SET nvd_last = '0001-01-01T00:00:00Z'`);
    await migrate();
    expect((await rows())["nvd"]?.watermark).toBeNull();

    await onConfig(`DELETE FROM config`);
    await migrate();
    const sync = await rows();
    expect(Object.keys(sync).sort()).toEqual(SOURCES);
    expect(sync["osv"]?.watermark).toBeNull();
  });

  it("runs through the TypeORM migration runner", async () => {
    class ThrowawayConfigMigration extends Migration {
      constructor() {
        super(configDb);
      }
    }
    const runner = new DataSource({
      ...knowledge.options,
      migrations: [ThrowawayConfigMigration],
    } as typeof knowledge.options);
    await runner.initialize();
    await runner.runMigrations();
    await runner.destroy();

    expect((await rows())["nvd"]?.watermark?.toISOString()).toBe(OLD_NVD);
  });

  it("rejects an unknown outcome", async () => {
    await migrate();
    await expect(
      knowledge.query(
        `UPDATE knowledge_source_sync SET last_outcome = 'maybe' WHERE source = 'nvd'`,
      ),
    ).rejects.toThrow(/last_outcome/);
  });

  it("drops the table on down", async () => {
    await migrate();
    const runner = knowledge.createQueryRunner();
    await new Migration(configDb).down(runner);
    await runner.release();

    const [row] = await knowledge.query(
      `SELECT to_regclass('knowledge_source_sync') AS name`,
    );
    expect(row.name).toBeNull();
  });
});
