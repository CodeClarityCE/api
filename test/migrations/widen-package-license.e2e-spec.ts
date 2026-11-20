import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_widen_package_license_${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = join(__dirname, "../../src/migrations/knowledge");

// A Composer license list joined as one OR expression, longer than 50 characters.
const LONG_LICENSE =
  "MIT OR GPL-2.0-or-later OR LGPL-2.1-or-later OR Apache-2.0 OR BSD-3-Clause";

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

// Every knowledge migration class up to this one, oldest first, so it is the last to undo.
function migrations(): (new () => MigrationInterface)[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(
      (file) =>
        file.endsWith(".ts") && file <= "1795392000000-WidenPackageLicense.ts",
    )
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

describe("WidenPackageLicense migration", () => {
  let source: DataSource;

  const saveLicense = async (name: string, license: string): Promise<void> => {
    await source.query(
      `INSERT INTO package (name, language, latest_version, license) VALUES ($1, 'php', '1.0.0', $2)`,
      [name, license],
    );
  };

  const licenseOf = async (name: string): Promise<string> => {
    const [row] = (await source.query(
      `SELECT license FROM package WHERE name = $1`,
      [name],
    )) as { license: string }[];
    return row!.license;
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

  it("saves a package license expression longer than 50 characters", async () => {
    await saveLicense("acme/many-licenses", LONG_LICENSE);

    expect(await licenseOf("acme/many-licenses")).toBe(LONG_LICENSE);
  });

  it("cuts long licenses to 50 characters on down, and widens again on up", async () => {
    await source.undoLastMigration();
    expect(await licenseOf("acme/many-licenses")).toBe(
      LONG_LICENSE.slice(0, 50),
    );

    await source.runMigrations();
    await saveLicense("acme/again", LONG_LICENSE);
    expect(await licenseOf("acme/again")).toBe(LONG_LICENSE);
  });
});
