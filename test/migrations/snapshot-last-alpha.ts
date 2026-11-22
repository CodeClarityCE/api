// Records the fixtures of the beta baselines from a checkout of the last alpha release:
// each database's schema after a fresh install, and its migrations table.
// Usage, from api/:
//   git worktree add /tmp/last-alpha v0.0.57-alpha && ln -s "$PWD/node_modules" /tmp/last-alpha/node_modules
//   node_modules/.bin/ts-node --transpile-only test/migrations/snapshot-last-alpha.ts /tmp/last-alpha
// then run Prettier on fixtures/last-alpha.
import { readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { DataSource, type MigrationInterface } from "typeorm";

import { connection, query, schemaSnapshot } from "./schema-snapshot";

const DATABASES = ["codeclarity", "knowledge", "plugins", "config"];
const FIXTURES = join(__dirname, "fixtures/last-alpha");
type MigrationClass = new (...args: string[]) => MigrationInterface;

async function main(checkout: string): Promise<void> {
  const prefix = `last_alpha_snapshot_${process.pid}`;
  // Like the Postgres init script: empty databases with uuid-ossp.
  for (const db of DATABASES) {
    await query("postgres", `CREATE DATABASE ${prefix}_${db}`);
    await query(
      `${prefix}_${db}`,
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
    );
  }
  try {
    for (const db of DATABASES) {
      const dir = join(checkout, "src/migrations", db);
      const classes = readdirSync(dir)
        .filter((file) => file.endsWith(".ts"))
        .sort()
        .map((file) => {
          const found = Object.values(
            require(join(dir, file)) as Record<string, MigrationClass>,
          )[0]!;
          // Its backfill reads the config row from the database named "config" by default.
          if (!found.name.startsWith("CreateKnowledgeSourceSync")) return found;
          return class extends found {
            constructor() {
              super(`${prefix}_config`);
            }
          };
        });
      const source = new DataSource({
        type: "postgres",
        host: connection.host,
        port: connection.port,
        username: connection.user,
        password: connection.password,
        database: `${prefix}_${db}`,
        migrations: classes,
      });
      await source.initialize();
      await source.runMigrations();
      await source.destroy();

      const snapshot = await schemaSnapshot(`${prefix}_${db}`);
      writeFileSync(
        join(FIXTURES, `${db}.schema.json`),
        `${JSON.stringify(snapshot, null, 2)}\n`,
      );
      const applied = await query<{ timestamp: string; name: string }>(
        `${prefix}_${db}`,
        `SELECT "timestamp", "name" FROM "migrations" ORDER BY "id"`,
      );
      writeFileSync(
        join(FIXTURES, `${db}.migrations.sql`),
        [
          `-- The migrations table of a fresh last alpha install (snapshot-last-alpha.ts).`,
          `CREATE TABLE "migrations" ("id" SERIAL NOT NULL, "timestamp" bigint NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id"));`,
          `INSERT INTO "migrations" ("timestamp", "name") VALUES`,
          applied
            .map((row) => `  (${row.timestamp}, '${row.name}')`)
            .join(",\n") + ";",
          "",
        ].join("\n"),
      );
    }
  } finally {
    for (const db of DATABASES) {
      await query(
        "postgres",
        `DROP DATABASE IF EXISTS ${prefix}_${db} WITH (FORCE)`,
      );
    }
  }
}

main(process.argv[2] ?? "").catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
