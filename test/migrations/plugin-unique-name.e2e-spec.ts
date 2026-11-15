import { Client } from "pg";
import { DataSource } from "typeorm";

import { Init1754648240560 as Init } from "../../src/migrations/plugins/1754648240560-Init";
import { UniquePluginName1795132800000 as Migration } from "../../src/migrations/plugins/1795132800000-UniquePluginName";

const connection = {
  host: process.env["PG_DB_HOST"] ?? "localhost",
  port: parseInt(process.env["PG_DB_PORT"] ?? "5432", 10),
  user: process.env["PG_DB_USER"] ?? "postgres",
  password: process.env["PG_DB_PASSWORD"] ?? "",
};
const pluginsDb = `test_plugin_unique_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

describe("UniquePluginName migration", () => {
  let plugins: DataSource;

  const run = async (
    step: "up" | "down",
    migration: Init | Migration = new Migration(),
  ): Promise<void> => {
    const runner = plugins.createQueryRunner();
    await migration[step](runner);
    await runner.release();
  };
  const addPlugin = (name: string, version: string): Promise<unknown> =>
    plugins.query(
      `INSERT INTO plugin (name, version, description, depends_on, config) VALUES ($1, $2, $3, '[]', '{}')`,
      [name, version, `${name} ${version}`],
    );
  const rows = (): Promise<{ name: string; version: string }[]> =>
    plugins.query(`SELECT name, version FROM plugin ORDER BY name, version`);

  beforeEach(async () => {
    await admin(`CREATE DATABASE ${pluginsDb}`);
    plugins = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database: pluginsDb,
      extra: { max: 1 },
    });
    await plugins.initialize();
    await plugins.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await run("up", new Init());
  });

  afterEach(async () => {
    await plugins.destroy();
    await admin(`DROP DATABASE ${pluginsDb}`);
  });

  it("merges duplicate names into one row, keeping the newest version", async () => {
    await addPlugin("js-sbom", "0.9.0");
    await addPlugin("js-sbom", "0.10.0");
    await addPlugin("js-sbom", "0.10.0");
    await addPlugin("js-sbom", "0.2.0");
    await addPlugin("vuln-finder", "1.0.0");
    await addPlugin("vuln-finder", "1.0.0");
    await addPlugin("license-finder", "1.0.0");

    await run("up");

    expect(await rows()).toEqual([
      { name: "js-sbom", version: "0.10.0" },
      { name: "license-finder", version: "1.0.0" },
      { name: "vuln-finder", version: "1.0.0" },
    ]);
  });

  it("rejects a second row with the same name", async () => {
    await run("up");
    await addPlugin("js-sbom", "1.0.0");

    await expect(addPlugin("js-sbom", "1.0.0")).rejects.toThrow(
      /UQ_plugin_name/,
    );
  });

  it("allows an upsert on the plugin name", async () => {
    await run("up");
    await addPlugin("js-sbom", "1.0.0");

    await plugins.query(
      `INSERT INTO plugin (name, version) VALUES ('js-sbom', '1.1.0')
       ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version`,
    );

    expect(await rows()).toEqual([{ name: "js-sbom", version: "1.1.0" }]);
  });

  it("drops the constraint on down", async () => {
    await run("up");
    await run("down");
    await addPlugin("js-sbom", "1.0.0");

    await expect(addPlugin("js-sbom", "1.0.0")).resolves.toBeDefined();
  });
});
