import { randomUUID } from "crypto";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type Repository } from "typeorm";

import { TypeOrmExperimentStore } from "../../src/codeclarity_modules/experiments/experiment-store";
import { LicensesRepository } from "../../src/codeclarity_modules/results/licenses/licenses.repository";
import { LicensesUtilsService } from "../../src/codeclarity_modules/results/licenses/utils/utils";
import { PatchingUtilsService } from "../../src/codeclarity_modules/results/patching/utils/utils";
import { Result } from "../../src/codeclarity_modules/results/result.entity";
import { AnalysisResultsRepository } from "../../src/codeclarity_modules/results/results.repository";
import { SBOMRepository } from "../../src/codeclarity_modules/results/sbom/sbom.repository";
import { SbomUtilsService } from "../../src/codeclarity_modules/results/sbom/utils/utils";
import { VulnerabilitiesUtilsService } from "../../src/codeclarity_modules/results/vulnerabilities/utils/utils.service";
import { VulnerabilitiesRepository } from "../../src/codeclarity_modules/results/vulnerabilities/vulnerabilities.repository";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_newest_result_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

const sbomUtils = (repository: Repository<Result>) =>
  new SbomUtilsService(undefined as never, undefined as never, repository);

const output = (marker: string) => ({
  workspaces: {},
  analysis_info: { status: "success", marker },
});

describe("Results of an analysis redelivered after a restart", () => {
  let data: DataSource;

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    const root = join(__dirname, "../../src");
    data = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      entities: [
        join(root, "base_modules/**/*.entity.ts"),
        join(root, "codeclarity_modules/**/*.entity.ts"),
      ],
      extra: { max: 2 },
    });
    await data.initialize();
    // Analysis columns other than these two stay unset in these tests.
    const columns = data
      .getMetadata("Analysis")
      .columns.map((c) => `"${c.databaseName}" text`)
      .filter((c) => !/^"(id|created_on)"/.test(c))
      .join(", ");
    await data.query(`
      CREATE TABLE analysis (id uuid PRIMARY KEY, created_on timestamp NOT NULL DEFAULT now(), ${columns});
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE result (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), result jsonb NOT NULL,
        plugin varchar NOT NULL, created_on timestamp NOT NULL, "analysisId" uuid
      );
    `);
  });

  afterAll(async () => {
    await data.destroy();
    await admin(`DROP DATABASE ${database} WITH (FORCE)`);
  });

  // The older row is stored first, as a redelivered result is.
  const redelivered = async (plugin: string): Promise<string> => {
    const analysisId = randomUUID();
    await data.query(`INSERT INTO analysis (id) VALUES ($1)`, [analysisId]);
    for (const [marker, stamp] of [
      ["old", "2026-11-09 20:19:37"],
      ["new", "2026-11-09 20:19:41"],
    ]) {
      await data.query(
        `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, $2, $3, $4)`,
        [JSON.stringify(output(marker!)), plugin, stamp, analysisId],
      );
    }
    return analysisId;
  };

  const marker = (value: unknown) =>
    (value as { analysis_info: { marker: string } }).analysis_info.marker;

  it.each([
    [
      "vuln-finder",
      (r: Repository<Result>, id: string) =>
        new VulnerabilitiesUtilsService(r).getVulnsResult(id),
    ],
    [
      "js-vuln-finder",
      (r: Repository<Result>, id: string) =>
        new VulnerabilitiesRepository(r).getVulnsResult(id),
    ],
    [
      "license-finder",
      (r: Repository<Result>, id: string) =>
        new LicensesUtilsService(r).getLicensesResult(id),
    ],
    [
      "js-license",
      (r: Repository<Result>, id: string) =>
        new LicensesRepository(r).getLicensesResult(id),
    ],
    [
      "js-sbom",
      (r: Repository<Result>, id: string) => sbomUtils(r).getSbomResult(id),
    ],
    [
      "php-sbom",
      (r: Repository<Result>, id: string) =>
        new SBOMRepository(r).getSbomResult(id),
    ],
    [
      "js-patching",
      (r: Repository<Result>, id: string) =>
        new PatchingUtilsService(r).getPatchingResult(id),
    ],
  ])("serves the newest %s row", async (plugin, lookup) => {
    const analysisId = await redelivered(plugin);

    const result = await lookup(data.getRepository(Result), analysisId);

    expect(marker(result)).toBe("new");
  });

  it("serves the newest row by plugin type", async () => {
    const analysisId = await redelivered("js-sbom");
    const repository = new AnalysisResultsRepository(
      data.getRepository(Result),
    );

    const result = await repository.getByAnalysisIdAndPluginType(
      analysisId,
      "js-sbom",
    );

    expect(marker(result?.result)).toBe("new");
  });

  it("serves the newest row to experiments", async () => {
    const analysisId = await redelivered("vuln-finder");
    const store = new (
      TypeOrmExperimentStore as unknown as new (
        ...repositories: unknown[]
      ) => TypeOrmExperimentStore
    )(undefined, undefined, data.getRepository(Result));

    expect(marker(await store.getPluginResult(analysisId, "vuln-finder"))).toBe(
      "new",
    );
  });

  it("merges only the newest row of each SBOM plugin", async () => {
    const analysisId = await redelivered("js-sbom");

    const merged = await sbomUtils(
      data.getRepository(Result),
    ).getMergedSbomResults(analysisId);

    expect(merged.pluginResults.map((r) => marker(r.sbom))).toEqual(["new"]);
  });
});
