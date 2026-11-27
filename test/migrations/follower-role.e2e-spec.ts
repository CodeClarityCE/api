import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import {
  type Database,
  DATABASES,
  followerAccess,
  migrate,
} from "../../src/scripts/migrate";

import { connection, query } from "./schema-snapshot";

type MigrationClass = new () => MigrationInterface;

const suffix = `${process.pid}_${Date.now()}`;
// Throwaway roles, so the test never touches the stack's own.
const follower = `test_follower_${suffix}`;
const service = `test_service_${suffix}`;
const password = "follower-test-password";
const databases = Object.fromEntries(
  DATABASES.map((db) => [db, `test_follower_${db}_${suffix}`]),
) as Record<Database, string>;

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

function open(db: Database): Promise<DataSource> {
  return Promise.resolve(
    new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database: databases[db],
      migrations: migrations(db),
      extra: { max: 1 },
    }),
  );
}

// Runs sql in a database as role, with its password.
async function as(
  role: string,
  db: Database,
  sql: string,
  params: unknown[] = [],
): Promise<unknown[]> {
  const client = new Client({
    ...connection,
    user: role,
    password,
    database: databases[db],
  });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as unknown[];
  } finally {
    await client.end();
  }
}

const UPSERT_PACKAGE = `INSERT INTO "package" (name, language, latest_version, licenses, extra, time)
  VALUES ('left-pad', 'javascript', '1.3.0', '[]', '{}', now())
  ON CONFLICT (name, language) DO UPDATE SET latest_version = EXCLUDED.latest_version, license = EXCLUDED.license
  RETURNING id`;
const UPSERT_VERSION = `INSERT INTO "version" (package_id, version, dependencies, dev_dependencies, extra)
  VALUES ($1, '1.3.0', '{}', '{}', '{}')
  ON CONFLICT (package_id, version) DO UPDATE SET dependencies = EXCLUDED.dependencies, updated_at = NOW()`;
// The two writes the follower makes to an analysis, as bun renders them.
const MARK_STARTED = `UPDATE "analysis" AS "analysis" SET status = 'updating_db', config = jsonb_set(COALESCE(config, '{}'::jsonb), '{package_follower_started_on}', to_jsonb('2026-11-27T00:00:00Z'::text)) WHERE (id = $1) AND (status NOT IN ('completed', 'failure', 'cancelled'))`;
const MARK_DONE = `UPDATE "analysis" AS "analysis" SET status = CASE WHEN status = 'updating_db' THEN 'ongoing' ELSE status END, config = jsonb_set(COALESCE(config, '{}'::jsonb), '{package_imports_done}', COALESCE(config->'package_imports_done', '{}'::jsonb) || jsonb_build_object('javascript'::text, '2026-11-27T00:00:00Z'::text)) WHERE (id = $1) AND (status NOT IN ('completed', 'failure', 'cancelled'))`;

const access = (withPassword = true): ReturnType<typeof followerAccess> =>
  followerAccess({
    role: follower,
    serviceRole: service,
    ...(withPassword ? { password } : {}),
  });

describe("The package follower's role", () => {
  let analysis: string;

  beforeAll(async () => {
    for (const db of DATABASES) {
      await query("postgres", `CREATE DATABASE ${databases[db]}`);
      await query(
        databases[db],
        `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; REVOKE ALL ON SCHEMA public FROM PUBLIC`,
      );
    }
    // The services' role as api#211 left it: allowed to write the package tables.
    await query(
      "postgres",
      `CREATE ROLE ${service} LOGIN PASSWORD '${password}'`,
    );
    for (const db of DATABASES) {
      await query(
        "postgres",
        `GRANT CONNECT ON DATABASE ${databases[db]} TO ${service}`,
      );
      await query(databases[db], `GRANT USAGE ON SCHEMA public TO ${service}`);
    }
    await migrate([...DATABASES], { open, roles: {}, grants: {} });
    await query(
      databases.knowledge,
      `GRANT SELECT, INSERT, UPDATE ON "package", "version" TO ${service}`,
    );

    await migrate([...DATABASES], { open, roles: {}, grants: access() });

    const [row] = await query<{ id: string }>(
      databases.codeclarity,
      `INSERT INTO "analysis" (created_on, config, status, steps, branch)
       VALUES (now(), '{}', 'ongoing', '[]', 'main') RETURNING id`,
    );
    analysis = row!.id;
  });

  afterAll(async () => {
    for (const db of DATABASES) {
      await query(
        "postgres",
        `DROP DATABASE IF EXISTS ${databases[db]} WITH (FORCE)`,
      );
    }
    await query("postgres", `DROP ROLE IF EXISTS ${follower}`);
    await query("postgres", `DROP ROLE IF EXISTS ${service}`);
  });

  it("connects to every database the service base pings", async () => {
    for (const db of DATABASES) {
      await expect(as(follower, db, "SELECT 1")).resolves.toHaveLength(1);
    }
  });

  it("imports packages and their versions", async () => {
    const [pkg] = (await as(follower, "knowledge", UPSERT_PACKAGE)) as {
      id: string;
    }[];
    await as(follower, "knowledge", UPSERT_VERSION, [pkg!.id]);
    // A second import of the same package updates it in place.
    await as(follower, "knowledge", UPSERT_PACKAGE);
    await as(follower, "knowledge", UPSERT_VERSION, [pkg!.id]);

    const versions = await query(
      databases.knowledge,
      `SELECT 1 FROM "version" WHERE package_id = $1`,
      [pkg!.id],
    );
    expect(versions).toHaveLength(1);
  });

  it("records an analysis's package import", async () => {
    await as(follower, "codeclarity", MARK_STARTED, [analysis]);
    await as(follower, "codeclarity", MARK_DONE, [analysis]);

    const [row] = await query<{ status: string; config: object }>(
      databases.codeclarity,
      `SELECT status, config FROM "analysis" WHERE id = $1`,
      [analysis],
    );
    expect(row).toEqual({
      status: "ongoing",
      config: {
        package_follower_started_on: "2026-11-27T00:00:00Z",
        package_imports_done: { javascript: "2026-11-27T00:00:00Z" },
      },
    });
  });

  it.each([
    ["knowledge", `DELETE FROM "package"`],
    [
      "knowledge",
      `INSERT INTO "licenses" (id, "licenseId", name) VALUES (uuid_generate_v4(), 'X', 'X')`,
    ],
    ["knowledge", `UPDATE "nvd" SET id = id`],
    ["codeclarity", `UPDATE "analysis" SET steps = '[]'`],
    ["codeclarity", `SELECT * FROM "user"`],
    ["codeclarity", `DELETE FROM "analysis"`],
  ] as [Database, string][])(
    "may not do anything else in %s: %s",
    async (db, sql) => {
      await expect(as(follower, db, sql)).rejects.toThrow(/permission denied/);
    },
  );

  it("takes the package writes away from the services' role, leaving it reads", async () => {
    await expect(as(service, "knowledge", UPSERT_PACKAGE)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as(service, "knowledge", `SELECT name FROM "package"`),
    ).resolves.toBeDefined();
  });

  it("is kept as it is when migrate runs again without the password", async () => {
    await migrate([...DATABASES], { open, roles: {}, grants: access(false) });

    await expect(
      as(follower, "knowledge", UPSERT_PACKAGE),
    ).resolves.toHaveLength(1);
  });

  it("fails migrate, naming the setting, when the role is missing and no password is set", async () => {
    const missing = followerAccess({
      role: `test_missing_${suffix}`,
      serviceRole: service,
    });

    await expect(
      migrate(["plugins"], { open, roles: {}, grants: missing }),
    ).rejects.toThrow(/PG_FOLLOWER_PASSWORD/);
  });
});
