import { Client } from "pg";
import { DataSource } from "typeorm";

import { Kev } from "../../src/codeclarity_modules/knowledge/kev/kev.entity";
import { KevRepository } from "../../src/codeclarity_modules/knowledge/kev/kev.repository";
import { CreateKevTable1795651200000 as CreateKevTable } from "../../src/migrations/knowledge/1795651200000-CreateKevTable";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_kev_lookup_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

describe("Known exploited vulnerabilities by canonical vulnerability", () => {
  let knowledge: DataSource;
  let repository: KevRepository;

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    knowledge = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      entities: [Kev],
      extra: { max: 1 },
    });
    await knowledge.initialize();
    await knowledge.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await knowledge.query(
      `CREATE TABLE knowledge_source_sync (source character varying PRIMARY KEY)`,
    );
    const runner = knowledge.createQueryRunner();
    await new CreateKevTable().up(runner);
    await runner.release();
    // Entries as the knowledge service mirrors them from the catalog.
    await knowledge.query(`
      INSERT INTO kev (cve, vendor_project, product, date_added, due_date, known_ransomware_use, cwes)
      VALUES
        ('CVE-2021-44228', 'Apache', 'Log4j2', '2021-12-10', '2021-12-24', true, '["CWE-20"]'),
        ('CVE-2021-45046', 'Apache', 'Log4j2', '2023-05-01', '2023-05-22', false, '[]'),
        ('CVE-2023-4966', 'Citrix', 'NetScaler', '2023-10-18', '2023-11-08', true, '["CWE-119"]');
    `);
    repository = new KevRepository(knowledge.getRepository(Kev));
  }, 60000);

  afterAll(async () => {
    await knowledge.destroy();
    await admin(`DROP DATABASE ${database} WITH (FORCE)`);
  });

  it("finds the entry of a canonical vulnerability the catalog lists", async () => {
    const found = await repository.findForVulnerabilities([
      { id: "CVE-2023-4966", aliases: [] },
    ]);

    const entry = found.get("CVE-2023-4966");
    expect(entry?.cve).toBe("CVE-2023-4966");
    expect(entry?.date_added).toBe("2023-10-18");
    expect(entry?.known_ransomware_use).toBe(true);
  });

  it("resolves an entry through any alias of the canonical vulnerability", async () => {
    const found = await repository.findForVulnerabilities([
      { id: "GHSA-jfh8-c2jp-5v3q", aliases: ["cve-2021-44228 "] },
      { id: "CVE-2020-0001", aliases: ["GHSA-xxxx", "CVE-2023-4966"] },
    ]);

    expect(found.get("GHSA-jfh8-c2jp-5v3q")?.cve).toBe("CVE-2021-44228");
    expect(found.get("CVE-2020-0001")?.cve).toBe("CVE-2023-4966");
  });

  it("gives the earliest added entry when several aliases are listed", async () => {
    const found = await repository.findForVulnerabilities([
      { id: "CVE-2021-45046", aliases: ["CVE-2021-44228"] },
    ]);

    expect(found.get("CVE-2021-45046")?.cve).toBe("CVE-2021-44228");
  });

  it("leaves out vulnerabilities the catalog does not list", async () => {
    const found = await repository.findForVulnerabilities([
      { id: "CVE-2024-9999", aliases: ["GHSA-none"] },
    ]);

    expect(found.size).toBe(0);
    await expect(repository.findForVulnerabilities([])).resolves.toEqual(
      new Map(),
    );
  });
});
