import * as dotenv from "dotenv";

import { CodeClarityLogger } from "../services/logger.service";

import "reflect-metadata";

const logger = CodeClarityLogger.forService("migrate");

// Every database the API migrates, in the order they must run: knowledge before config.
export const DATABASES = [
  "codeclarity",
  "knowledge",
  "plugins",
  "config",
] as const;
export type Database = (typeof DATABASES)[number];

// The part of a TypeORM DataSource the migrate entry uses.
export interface MigrationTarget {
  initialize(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  runMigrations(): Promise<unknown>;
  destroy(): Promise<void>;
}

export interface MigrateOptions {
  open: (db: Database) => Promise<MigrationTarget>;
  // Role to SET before migrating, so new objects get the right owner.
  roles: Partial<Record<Database, string>>;
}

// The named databases in run order, or all of them when none is named.
export function selectDatabases(names: string[]): Database[] {
  for (const name of names) {
    if (!(DATABASES as readonly string[]).includes(name)) {
      throw new Error(
        `Unknown database ${name} (expected ${DATABASES.join(", ")})`,
      );
    }
  }
  if (names.length === 0) return [...DATABASES];
  return DATABASES.filter((db) => names.includes(db));
}

// A failed connection to every address comes as an AggregateError with no message of its own.
function describe(error: unknown): string {
  if (error instanceof AggregateError && !error.message) {
    return error.errors.map(describe).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

export async function migrate(
  databases: Database[],
  { open, roles }: MigrateOptions,
): Promise<void> {
  for (const db of databases) {
    const source = await open(db);
    let connected = false;
    try {
      await source.initialize();
      connected = true;
      const role = roles[db];
      if (role) await source.query(`SET ROLE ${role}`);
      await source.runMigrations();
    } catch (error) {
      throw new Error(`Migrations failed for ${db}: ${describe(error)}`, {
        cause: error,
      });
    } finally {
      if (connected) await source.destroy();
    }
  }
}

// Connects as PG_DB_ADMIN_USER when set, then SETs each database's owning role.
async function main(): Promise<void> {
  dotenv.config({
    path: `env/.env.${process.env["ENV"] ?? "dev"}`,
    quiet: true,
  });
  const databases = selectDatabases(process.argv.slice(2));

  const useAdmin = !!process.env["PG_DB_ADMIN_USER"];
  if (useAdmin) {
    process.env["PG_DB_USER"] = process.env["PG_DB_ADMIN_USER"];
    process.env["PG_DB_PASSWORD"] = process.env["PG_DB_ADMIN_PASSWORD"] ?? "";
  }
  const roles: Partial<Record<Database, string>> = useAdmin
    ? {
        codeclarity: process.env["PG_CODECLARITY_ROLE"] ?? "cc_api",
        knowledge: process.env["PG_KNOWLEDGE_ROLE"] ?? "cc_knowledge",
        plugins: process.env["PG_PLUGINS_ROLE"] ?? "cc_api",
        config: process.env["PG_CONFIG_ROLE"] ?? "cc_api",
      }
    : {};

  // Imported late so the datasources read the admin credentials set above.
  const loaders: Record<Database, () => Promise<MigrationTarget>> = {
    codeclarity: async () =>
      (await import("../datasources/codeclarity.datasource"))
        .CodeClarityDataSource,
    knowledge: async () =>
      (await import("../datasources/knowledge.datasource")).KnowledgeDataSource,
    plugins: async () =>
      (await import("../datasources/plugins.datasource")).PluginsDataSource,
    config: async () =>
      (await import("../datasources/config.datasource")).ConfigDataSource,
  };
  const open = (db: Database): Promise<MigrationTarget> => loaders[db]();

  await migrate(databases, { open, roles });
  logger.log("Migrations applied", { databases });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error(
      "Migrations failed",
      error instanceof Error ? error : String(error),
    );
    process.exit(1);
  });
}
