import { readFileSync } from "fs";
import type { QueryRunner } from "typeorm";

// The last alpha release, whose schema the beta baselines hold; only it upgrades to beta (ADR 0018).
const LAST_ALPHA = "deployment v0.0.32-alpha, API v0.0.57-alpha";

export interface BetaBaseline {
  database: string;
  // The SQL file that builds the last alpha's schema on an empty database.
  schema: string;
  // The last migration the last alpha applied to this database.
  lastAlphaMigration: string;
}

// Builds the last alpha's schema on an empty database. On a database the last alpha
// migrated it changes nothing and drops the squashed migrations' rows; any other is refused.
export async function applyBetaBaseline(
  runner: QueryRunner,
  { database, schema, lastAlphaMigration }: BetaBaseline,
): Promise<void> {
  if (await recorded(runner, lastAlphaMigration)) {
    const timestamp = migrationTimestamp(lastAlphaMigration);
    await runner.query(`DELETE FROM "migrations" WHERE "timestamp" <= $1`, [
      timestamp,
    ]);
    return;
  }
  const [tables] = (await runner.query(
    `SELECT count(*)::int AS count FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  )) as { count: number }[];
  if ((tables?.count ?? 0) > 0) {
    throw new Error(
      `The ${database} database has tables but ${lastAlphaMigration} never ran on it: ` +
        `it comes from an alpha older than the last alpha (${LAST_ALPHA}). ` +
        `Upgrade to the last alpha first, then to this release.`,
    );
  }
  await runner.query(readFileSync(schema, "utf8"));
}

// The 13-digit millisecond timestamp TypeORM migration names end with.
function migrationTimestamp(name: string): string {
  const match = /(\d{13})$/.exec(name);
  if (!match?.[1]) {
    throw new Error(`${name} does not end with a 13-digit migration timestamp`);
  }
  return match[1];
}

// Reverting would drop every table, so it is refused.
export function refuseRevert(database: string): never {
  throw new Error(
    `The ${database} beta baseline cannot be reverted: it holds the whole schema.`,
  );
}

async function recorded(runner: QueryRunner, name: string): Promise<boolean> {
  const [table] = (await runner.query(
    `SELECT to_regclass('public.migrations') AS name`,
  )) as { name: string | null }[];
  if (table?.name === null || table?.name === undefined) return false;
  const found = (await runner.query(
    `SELECT 1 FROM "migrations" WHERE "name" = $1`,
    [name],
  )) as unknown[];
  return found.length > 0;
}
