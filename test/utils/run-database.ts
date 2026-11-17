import { randomBytes } from "node:crypto";
import { Client } from "pg";

// Differs between concurrent jest workers and between shells.
const runId = (): string => `${process.pid}_${randomBytes(4).toString("hex")}`;

/** A database name unique to this run, still ending in `_test`. */
export function runDatabaseName(prefix: string): string {
  return `${prefix}_${runId()}_test`;
}

function adminClient(): Client {
  return new Client({
    host: process.env["PG_DB_HOST"] ?? "localhost",
    port: Number(process.env["PG_DB_PORT"] ?? 5432),
    user: process.env["PG_DB_USER"] ?? "postgres",
    password: process.env["PG_DB_PASSWORD"] ?? "",
    database: "postgres",
  });
}

function assertRunDatabase(name: string): void {
  if (!/^[a-z][a-z0-9_]*_test$/.test(name)) {
    throw new Error(`Refusing to use "${name}": not a test database`);
  }
}

export async function createRunDatabase(name: string): Promise<void> {
  assertRunDatabase(name);
  const admin = adminClient();
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
}

export async function dropRunDatabase(name: string): Promise<void> {
  assertRunDatabase(name);
  const admin = adminClient();
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
