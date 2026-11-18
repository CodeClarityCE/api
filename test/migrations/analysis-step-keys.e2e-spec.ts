import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { CapitalizeAnalysisStepKeys1795392000000 as Migration } from "../../src/migrations/codeclarity/1795392000000-CapitalizeAnalysisStepKeys";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_analysis_step_keys_${process.pid}_${Date.now()}`;
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

// A step as the API used to write it, with an option that has its own name key.
const lowercaseStep = {
  name: "js-sbom",
  version: "v0.0.27-alpha",
  status: "requested",
  config: { branch: { name: "branch", required: true } },
};

const capitalizedStep = {
  Name: "js-sbom",
  Version: "v0.0.27-alpha",
  Status: "success",
  Result: { sbomKey: "k1" },
  Config: { branch: { name: "branch", required: true } },
  Started_on: "2026-11-15T00:58:04.946770545Z",
  Ended_on: "2026-11-15T00:58:04.955225212Z",
};

describe("CapitalizeAnalysisStepKeys migration", () => {
  let source: DataSource;

  const run = async (step: "up" | "down"): Promise<void> => {
    const runner = source.createQueryRunner();
    await new Migration()[step](runner);
    await runner.release();
  };

  const insert = async (steps: unknown): Promise<string> => {
    const [row] = await source.query(
      `INSERT INTO analysis (created_on, config, status, steps, branch)
       VALUES (now(), '{}', 'requested', $1, 'main') RETURNING id`,
      [JSON.stringify(steps)],
    );
    return row.id;
  };

  const stepsOf = async (id: string): Promise<unknown> =>
    (await source.query(`SELECT steps FROM analysis WHERE id = $1`, [id]))[0]
      .steps;

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

  beforeEach(async () => {
    await source.query(`DELETE FROM analysis`);
  });

  it("capitalizes the keys of lowercase steps and keeps their values", async () => {
    const id = await insert([
      [lowercaseStep],
      [
        {
          name: "vuln-finder",
          version: "v1",
          status: "failure",
          result: null,
          config: {},
          started_on: "s",
          ended_on: "e",
        },
      ],
    ]);

    await run("up");

    expect(await stepsOf(id)).toEqual([
      [
        {
          Name: "js-sbom",
          Version: "v0.0.27-alpha",
          Status: "requested",
          Config: { branch: { name: "branch", required: true } },
        },
      ],
      [
        {
          Name: "vuln-finder",
          Version: "v1",
          Status: "failure",
          Result: null,
          Config: {},
          Started_on: "s",
          Ended_on: "e",
        },
      ],
    ]);
  });

  it("leaves capitalized steps, empty lists and stages that are not lists unchanged", async () => {
    const capitalized = await insert([[capitalizedStep]]);
    const empty = await insert([]);
    const odd = await insert([{ not: "a stage" }, [], [lowercaseStep]]);

    await run("up");

    expect(await stepsOf(capitalized)).toEqual([[capitalizedStep]]);
    expect(await stepsOf(empty)).toEqual([]);
    expect(await stepsOf(odd)).toEqual([
      { not: "a stage" },
      [],
      [
        {
          Name: "js-sbom",
          Version: "v0.0.27-alpha",
          Status: "requested",
          Config: { branch: { name: "branch", required: true } },
        },
      ],
    ]);
  });

  it("keeps the capitalized value when a step has both spellings", async () => {
    const id = await insert([[{ ...capitalizedStep, status: "requested" }]]);

    await run("up");

    expect(await stepsOf(id)).toEqual([[capitalizedStep]]);
  });

  it("changes nothing when run again, and down does nothing", async () => {
    const id = await insert([[lowercaseStep], [capitalizedStep]]);
    await run("up");
    const once = await stepsOf(id);

    await run("up");
    expect(await stepsOf(id)).toEqual(once);

    await run("down");
    expect(await stepsOf(id)).toEqual(once);
  });

  it("leaves no step with a lowercase name or status key", async () => {
    await insert([[lowercaseStep, capitalizedStep]]);
    await insert([[capitalizedStep]]);

    await run("up");

    const [{ count }] = await source.query(
      `SELECT count(*)::int AS count
       FROM analysis, jsonb_array_elements(steps) stg, jsonb_array_elements(stg) step
       WHERE step ? 'name' OR step ? 'status'`,
    );
    expect(count).toBe(0);
  });
});
