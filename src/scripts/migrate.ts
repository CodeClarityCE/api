import { createHash, createHmac, pbkdf2Sync, randomBytes } from "crypto";
import type { DataSource } from "typeorm";

import { CodeClarityLogger } from "../services/logger.service";

import { runScript } from "./run-script";

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
  // Statements run after the migrations on every run, so a restored dump gets them too.
  grants?: Partial<Record<Database, string[]>>;
}

// A plain lower-case role name, so it is safe to put in SQL as is.
function roleName(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid role name ${name}`);
  }
  return name;
}

// The SCRAM-SHA-256 secret Postgres stores for a password, so the password itself never
// reaches the server or its statement log.
function scramVerifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations = 4096,
): string {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const hmac = (key: string): Buffer =>
    createHmac("sha256", salted).update(key).digest();
  const storedKey = createHash("sha256").update(hmac("Client Key")).digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${hmac("Server Key").toString("base64")}`;
}

interface FollowerAccessOptions {
  // The package follower's own role.
  role: string;
  // The role the other Go services share, which loses the package writes.
  serviceRole: string;
  // Needed only to create the role when it is missing.
  password?: string;
}

// The package follower's role and the least it needs: connect to every database (the service
// base pings them all), import packages into knowledge, and record the import on the analysis.
export function followerAccess({
  role,
  serviceRole,
  password,
}: FollowerAccessOptions): Partial<Record<Database, string[]>> {
  const follower = roleName(role);
  const service = roleName(serviceRole);
  const create =
    password === undefined
      ? `RAISE EXCEPTION 'role ${follower} does not exist: set PG_FOLLOWER_PASSWORD so migrate can create it'`
      : `CREATE ROLE ${follower} LOGIN PASSWORD '${scramVerifier(password)}'`;
  const ensureRole = `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${follower}') THEN ${create}; END IF; END $$`;
  const connect = `DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${follower}', current_database()); END $$`;
  const usage = `GRANT USAGE ON SCHEMA public TO ${follower}`;
  return {
    codeclarity: [
      ensureRole,
      connect,
      usage,
      `GRANT SELECT (id, status, config), UPDATE (status, config) ON "analysis" TO ${follower}`,
    ],
    knowledge: [
      ensureRole,
      connect,
      usage,
      `GRANT SELECT, INSERT, UPDATE ON "package", "version" TO ${follower}`,
      // Only the follower writes package metadata.
      `DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${service}') THEN REVOKE INSERT, UPDATE ON "package", "version" FROM ${service}; END IF; END $$`,
    ],
    plugins: [ensureRole, connect],
    config: [ensureRole, connect],
  };
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
  { open, roles, grants = {} }: MigrateOptions,
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
      // Granted as the admin, who may grant on tables whatever role owns them.
      const dbGrants = grants[db] ?? [];
      if (role && dbGrants.length > 0) await source.query("RESET ROLE");
      for (const grant of dbGrants) await source.query(grant);
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
  // Applied on every install, admin or not, so a migrate that cannot apply them fails.
  const followerPassword = process.env["PG_FOLLOWER_PASSWORD"];
  const grants = followerAccess({
    role: "cc_follower",
    serviceRole: process.env["PG_SERVICE_ROLE"] ?? "cc_service",
    ...(followerPassword ? { password: followerPassword } : {}),
  });

  // Imported late so the datasources read the admin credentials set above.
  const loaders: Record<Database, () => Promise<DataSource>> = {
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
  // Dev migrates the _test copies with PG_DB_NAME_SUFFIX=_test.
  const suffix = process.env["PG_DB_NAME_SUFFIX"] ?? "";
  const open = async (db: Database): Promise<MigrationTarget> => {
    const source = await loaders[db]();
    if (suffix) source.setOptions({ database: `${db}${suffix}` });
    return source;
  };

  await migrate(databases, { open, roles, grants });
  logger.log("Migrations applied", { databases, suffix });
}

runScript(module, "migrate", main);
