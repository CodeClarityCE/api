import { Client } from "pg";
import { DataSource } from "typeorm";

import { AddKnowledgeSourceOrigins1794441600000 as Migration } from "../../src/migrations/knowledge/1794441600000-AddKnowledgeSourceOrigins";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const knowledgeDb = `test_source_origins_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

const fopReference = (path: string): string =>
  `[{"type":"WEB","url":"https://github.com/FriendsOfPHP/security-advisories/blob/master/${path}"}]`;

describe("AddKnowledgeSourceOrigins migration", () => {
  let knowledge: DataSource;

  const migrate = async (): Promise<void> => {
    const runner = knowledge.createQueryRunner();
    await new Migration().up(runner);
    await runner.release();
  };
  const origins = async (
    table: string,
    key: string,
  ): Promise<Record<string, string>> => {
    const rows: { key: string; origin: string }[] = await knowledge.query(
      `SELECT "${key}" AS key, origin FROM "${table}"`,
    );
    return Object.fromEntries(rows.map((row) => [row.key, row.origin]));
  };
  const addOsv = (id: string, references = "[]"): Promise<unknown> =>
    knowledge.query(
      `INSERT INTO osv (osv_id, "references") VALUES ($1, $2::jsonb)`,
      [id, references],
    );
  const addFriendsOfPhp = (
    id: string,
    reference: string,
    link: string,
  ): Promise<unknown> =>
    knowledge.query(
      `INSERT INTO friends_of_php (advisory_id, reference, link) VALUES ($1, $2, $3)`,
      [id, reference, link],
    );

  beforeEach(async () => {
    await admin(`CREATE DATABASE ${knowledgeDb}`);
    knowledge = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database: knowledgeDb,
      extra: { max: 1 },
    });
    await knowledge.initialize();
    await knowledge.query(`
      CREATE TABLE osv (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        osv_id varchar NOT NULL UNIQUE, "references" jsonb
      )`);
    await knowledge.query(`
      CREATE TABLE nvd (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nvd_id varchar NOT NULL UNIQUE
      )`);
    await knowledge.query(`
      CREATE TABLE gcve (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        gcve_id varchar NOT NULL UNIQUE
      )`);
    await knowledge.query(`
      CREATE TABLE friends_of_php (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        advisory_id varchar NOT NULL UNIQUE,
        reference varchar NOT NULL, link varchar NOT NULL
      )`);
  });

  afterEach(async () => {
    await knowledge.destroy();
    await admin(`DROP DATABASE ${knowledgeDb} WITH (FORCE)`);
  });

  it("derives NVD records and CVE-list GCVE records from the CVE list", async () => {
    await knowledge.query(`INSERT INTO nvd (nvd_id) VALUES ('CVE-2024-0001')`);
    await knowledge.query(
      `INSERT INTO gcve (gcve_id) VALUES ('GCVE-0-2024-0001'), ('GCVE-1-2024-0007')`,
    );

    await migrate();

    expect(await origins("nvd", "nvd_id")).toEqual({
      "CVE-2024-0001": "cve-list",
    });
    expect(await origins("gcve", "gcve_id")).toEqual({
      "GCVE-0-2024-0001": "cve-list",
      "GCVE-1-2024-0007": "gcve",
    });
  });

  it("derives OSV records from the database their id names", async () => {
    await addOsv("GHSA-aaaa-bbbb-cccc");
    await addOsv(
      "GHSA-dddd-eeee-ffff",
      fopReference("symfony/http-foundation/CVE-2012-6431.yaml"),
    );
    await addOsv("CVE-2024-0002");
    await addOsv("MAL-2024-1");
    await addOsv("DRUPAL-CORE-2024-001");
    await addOsv("PYSEC-2024-9", "null");

    await migrate();

    expect(await origins("osv", "osv_id")).toEqual({
      "GHSA-aaaa-bbbb-cccc": "ghsa",
      "GHSA-dddd-eeee-ffff": "friendsofphp",
      "CVE-2024-0002": "cve-list",
      "MAL-2024-1": "mal",
      "DRUPAL-CORE-2024-001": "drupal",
      "PYSEC-2024-9": "pysec",
    });
  });

  it("separates FriendsOfPHP advisories copied from GitHub and former Packagist rows", async () => {
    await addFriendsOfPhp(
      "symfony/http-foundation/CVE-2012-6431",
      "composer://symfony/http-foundation",
      "https://symfony.com/cve-2012-6431",
    );
    await addFriendsOfPhp(
      "twig/twig/2024-01-01",
      "composer://twig/twig",
      "https://github.com/twigphp/Twig/security/advisories/GHSA-0000-0000-0000",
    );
    await addFriendsOfPhp(
      "PKSA-aaaa-bbbb-cccc",
      "symfony/symfony/CVE-2019-18886.yaml",
      "https://symfony.com/cve-2019-18886",
    );
    await addFriendsOfPhp(
      "PKSA-dddd-eeee-ffff",
      "GHSA-r39x-jcww-82v6",
      "https://github.com/advisories/GHSA-r39x-jcww-82v6",
    );
    await addFriendsOfPhp(
      "PKSA-gggg-hhhh-iiii",
      "other-1",
      "https://example.com",
    );

    await migrate();

    expect(await origins("friends_of_php", "advisory_id")).toEqual({
      "symfony/http-foundation/CVE-2012-6431": "friendsofphp",
      "twig/twig/2024-01-01": "ghsa",
      "PKSA-aaaa-bbbb-cccc": "friendsofphp",
      "PKSA-dddd-eeee-ffff": "ghsa",
      "PKSA-gggg-hhhh-iiii": "packagist",
    });
  });

  it("keeps the origin current when a record changes", async () => {
    await migrate();
    await addFriendsOfPhp(
      "PKSA-aaaa-bbbb-cccc",
      "symfony/symfony/CVE-2019-18886.yaml",
      "https://symfony.com/cve-2019-18886",
    );

    await knowledge.query(
      `UPDATE friends_of_php SET advisory_id = 'symfony/symfony/CVE-2019-18886', reference = 'composer://symfony/symfony'`,
    );

    expect(await origins("friends_of_php", "advisory_id")).toEqual({
      "symfony/symfony/CVE-2019-18886": "friendsofphp",
    });
  });

  it("drops the origin columns on down", async () => {
    await migrate();
    const runner = knowledge.createQueryRunner();
    await new Migration().down(runner);
    await runner.release();

    const columns: unknown[] = await knowledge.query(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'origin'`,
    );
    expect(columns).toEqual([]);
  });
});
