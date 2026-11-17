import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { TicketDeleteRules1795305600000 as Migration } from "../../src/migrations/codeclarity/1795305600000-TicketDeleteRules";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_ticket_delete_rules_${process.pid}_${Date.now()}`;
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

describe("TicketDeleteRules migration", () => {
  let source: DataSource;

  const run = async (step: "up" | "down"): Promise<void> => {
    const runner = source.createQueryRunner();
    await new Migration()[step](runner);
    await runner.release();
  };

  // The ON DELETE rule of each ticket foreign key this migration changes.
  const rules = async (): Promise<Record<string, string>> => {
    const rows: { name: string; definition: string }[] = await source.query(
      `SELECT conrelid::regclass::text || '.' || a.attname AS name,
              pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND conrelid::regclass::text IN ('ticket', 'ticket_vulnerability_occurrence')
         AND a.attname IN ('projectId', 'sourceAnalysisId', 'analysisId')`,
    );
    return Object.fromEntries(
      rows.map((r) => [
        r.name,
        /ON DELETE (CASCADE|SET NULL)/.exec(r.definition)?.[1] ?? "NO ACTION",
      ]),
    );
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

  const NEW_RULES = {
    "ticket.projectId": "CASCADE",
    "ticket.sourceAnalysisId": "SET NULL",
    "ticket_vulnerability_occurrence.analysisId": "CASCADE",
  };

  it("sets the new delete rules", async () => {
    expect(await rules()).toEqual(NEW_RULES);
  });

  it("restores NO ACTION on down, and the new rules on up", async () => {
    await run("down");
    expect(await rules()).toEqual({
      "ticket.projectId": "NO ACTION",
      "ticket.sourceAnalysisId": "NO ACTION",
      "ticket_vulnerability_occurrence.analysisId": "NO ACTION",
    });

    await run("up");
    expect(await rules()).toEqual(NEW_RULES);
  });
});
