import { Client } from "pg";
import { DataSource } from "typeorm";

import { KnowledgeDbComparisonService } from "../../src/codeclarity_modules/knowledge/comparison/knowledge-db-comparison.service";
import { SourceOriginService } from "../../src/codeclarity_modules/knowledge/comparison/source-origin.service";
import { KnowledgeStatusService } from "../../src/codeclarity_modules/knowledge/status/knowledge-status.service";
import { AddKnowledgeSourceOrigins1794441600000 as AddOrigins } from "../../src/migrations/knowledge/1794441600000-AddKnowledgeSourceOrigins";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_source_comparison_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

const CRITICAL_VECTOR = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
const nvdMetrics = (score: number) =>
  JSON.stringify({ cvssMetricV31: [{ cvssData: { baseScore: score } }] });
const gcveMetrics = (score: number) =>
  JSON.stringify([{ other: {} }, { cvssV3_1: { baseScore: score } }]);

// Knowledge tables with the columns the comparison reads, as migrated.
const SCHEMA = `
  CREATE TABLE osv (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    osv_id varchar NOT NULL UNIQUE, cve varchar, aliases jsonb, "references" jsonb,
    severity jsonb, affected jsonb, published timestamptz,
    kind varchar NOT NULL DEFAULT 'vulnerability', retired_at timestamptz,
    cve_aliases jsonb GENERATED ALWAYS AS (
      COALESCE(jsonb_path_query_array(aliases, '$[*] ? (@ starts with "CVE-")'), '[]'::jsonb)
    ) STORED
  );
  CREATE TABLE nvd (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nvd_id varchar NOT NULL UNIQUE, metrics jsonb, published timestamptz,
    retired_at timestamptz
  );
  CREATE TABLE gcve (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gcve_id varchar NOT NULL UNIQUE, cve_id varchar, metrics jsonb,
    date_published timestamptz, retired_at timestamptz
  );
  CREATE TABLE friends_of_php (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    advisory_id varchar NOT NULL UNIQUE, cve varchar, composer varchar,
    reference varchar NOT NULL, link varchar NOT NULL,
    branches jsonb NOT NULL DEFAULT '{}', published timestamptz,
    retired_at timestamptz
  );
  CREATE TABLE knowledge_source_sync (
    source varchar PRIMARY KEY, watermark timestamptz,
    last_run_started_at timestamptz, last_run_finished_at timestamptz,
    last_outcome varchar, row_count bigint NOT NULL DEFAULT 0,
    validation_error text
  );
`;

describe("Knowledge source comparison", () => {
  let knowledge: DataSource;

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    knowledge = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      extra: { max: 2 },
    });
    await knowledge.initialize();
    await knowledge.query(SCHEMA);
    const runner = knowledge.createQueryRunner();
    await new AddOrigins().up(runner);
    await runner.release();

    await knowledge.query(
      `INSERT INTO osv (osv_id, aliases, severity, affected, published, kind, retired_at) VALUES
        ('GHSA-aaaa', '["CVE-2024-0001"]', $1, $2, '2024-01-01T00:00:00Z', 'vulnerability', NULL),
        ('MAL-2024-1', '["CVE-2024-0001"]', NULL, NULL, '2023-01-01T00:00:00Z', 'malicious', NULL),
        ('GHSA-rrrr', '["CVE-2024-0003"]', NULL, NULL, '2024-01-01T00:00:00Z', 'vulnerability', now()),
        ('GHSA-nnnn', '[]', NULL, NULL, '2024-01-01T00:00:00Z', 'vulnerability', NULL)`,
      [
        JSON.stringify([{ type: "CVSS_V3", score: CRITICAL_VECTOR }]),
        JSON.stringify([
          {
            package: { ecosystem: "Packagist", name: "vendor/pkg" },
            ranges: [
              {
                type: "ECOSYSTEM",
                events: [{ introduced: "1.0.0" }, { fixed: "1.2.0" }],
              },
            ],
          },
        ]),
      ],
    );
    await knowledge.query(
      `INSERT INTO nvd (nvd_id, metrics, published) VALUES
        ('CVE-2024-0001', $1, '2024-01-03T00:00:00Z'),
        ('CVE-2024-0002', $2, '2024-02-01T00:00:00Z'),
        ('CVE-2024-0004', '{}', '2024-03-01T00:00:00Z')`,
      [nvdMetrics(7.5), nvdMetrics(5.0)],
    );
    await knowledge.query(
      `INSERT INTO gcve (gcve_id, cve_id, metrics, date_published) VALUES
        ('GCVE-0-2024-0002', 'CVE-2024-0002', $1, '2024-02-02T00:00:00Z'),
        ('GCVE-1-2024-0009', NULL, '[]', '2024-02-02T00:00:00Z')`,
      [gcveMetrics(5.3)],
    );
    // Linking a GitHub advisory gives this FriendsOfPHP record the ghsa origin.
    await knowledge.query(
      `INSERT INTO friends_of_php (advisory_id, cve, composer, reference, link, branches, published) VALUES
        ('vendor/pkg/CVE-2024-0001', 'CVE-2024-0001', 'vendor/pkg', 'composer://vendor/pkg',
         'https://github.com/advisories/GHSA-aaaa', $1, '2023-12-31T00:00:00Z')`,
      [
        JSON.stringify({
          "1.x": {
            versions: [">=1.0.0", "<1.3.0"],
            time: "2023-12-31 00:00:00",
          },
        }),
      ],
    );
  });

  afterAll(async () => {
    await knowledge.destroy();
    await admin(`DROP DATABASE ${database} WITH (FORCE)`);
  });

  const setStatus = async (failed: string[] = []): Promise<void> => {
    await knowledge.query(`DELETE FROM knowledge_source_sync`);
    for (const source of ["osv", "nvd", "gcve", "friends_of_php"]) {
      await knowledge.query(
        `INSERT INTO knowledge_source_sync (source, watermark, last_run_started_at, last_run_finished_at, last_outcome)
         VALUES ($1, now(), now(), now(), $2)`,
        [source, failed.includes(source) ? "failure" : "success"],
      );
    }
  };
  const compare = () =>
    new KnowledgeDbComparisonService(
      knowledge,
      new KnowledgeStatusService(knowledge),
    ).compare();

  it("measures coverage, overlap, severity, affected-version and lag across the knowledge DB", async () => {
    await setStatus();

    const result = await compare();

    expect(result.sources).toEqual([
      {
        source: "osv",
        status: "healthy",
        comparable: true,
        records: 2,
        records_without_cve: 1,
        vulnerabilities: 2,
        only_source: 1,
      },
      {
        source: "friends_of_php",
        status: "healthy",
        comparable: true,
        records: 1,
        records_without_cve: 0,
        vulnerabilities: 1,
        only_source: 0,
      },
      {
        source: "gcve",
        status: "healthy",
        comparable: true,
        records: 2,
        records_without_cve: 1,
        vulnerabilities: 2,
        only_source: 1,
      },
      {
        source: "nvd",
        status: "healthy",
        comparable: true,
        records: 3,
        records_without_cve: 0,
        vulnerabilities: 3,
        only_source: 1,
      },
    ]);
    expect(result.overlap).toEqual([
      {
        sources: ["friends_of_php", "nvd"],
        vulnerabilities: 1,
        same_origin: 0,
        corroborating: 1,
      },
      {
        sources: ["friends_of_php", "osv"],
        vulnerabilities: 1,
        same_origin: 1,
        corroborating: 0,
      },
      {
        sources: ["gcve", "nvd"],
        vulnerabilities: 1,
        same_origin: 1,
        corroborating: 0,
      },
      {
        sources: ["nvd", "osv"],
        vulnerabilities: 1,
        same_origin: 0,
        corroborating: 1,
      },
    ]);
    expect(result.severity).toEqual([
      {
        sources: ["gcve", "nvd"],
        compared: 1,
        class_disagreements: 0,
        mean_score_difference: 0.3,
      },
      {
        sources: ["nvd", "osv"],
        compared: 1,
        class_disagreements: 1,
        mean_score_difference: 2.3,
      },
    ]);
    expect(result.affected_versions).toEqual([
      {
        sources: ["friends_of_php", "osv"],
        compared: 1,
        fixed_version_disagreements: 1,
        package_not_named: 0,
      },
    ]);
    expect(result.disclosure_lag).toEqual([
      {
        source: "osv",
        date_kind: "published",
        compared: 1,
        first: 1,
        median_days: 0,
        mean_days: 0,
      },
      {
        source: "friends_of_php",
        date_kind: "earliest_fix_release",
        compared: 1,
        first: 0,
        median_days: -1,
        mean_days: -1,
      },
      {
        source: "gcve",
        date_kind: "published",
        compared: 1,
        first: 0,
        median_days: 1,
        mean_days: 1,
      },
      {
        source: "nvd",
        date_kind: "published",
        compared: 2,
        first: 1,
        median_days: 1,
        mean_days: 1,
      },
    ]);
  });

  it("flags a failed source and leaves it out of every comparison", async () => {
    await setStatus(["nvd"]);

    const result = await compare();

    expect(result.sources.find((s) => s.source === "nvd")).toMatchObject({
      status: "failed",
      comparable: false,
      records: 3,
    });
    const pairs = [
      ...result.overlap,
      ...result.severity,
      ...result.affected_versions,
    ].map((entry) => entry.sources);
    expect(pairs.flat()).not.toContain("nvd");
    expect(result.disclosure_lag.map((l) => l.source)).not.toContain("nvd");
  });

  it("keys records on the canonical vulnerability through transitive aliases", async () => {
    await setStatus();
    const pair = (
      result: Awaited<ReturnType<typeof compare>>,
      a: string,
      b: string,
    ): number =>
      result.overlap.find((o) => o.sources.join() === [a, b].join())
        ?.vulnerabilities ?? 0;
    const before = await compare();

    await knowledge.query(
      `INSERT INTO osv (osv_id, aliases, published) VALUES
        ('GHSA-join', '["CVE-2025-0006", "CVE-2025-0005"]', '2025-01-01T00:00:00Z'),
        ('GHSA-only', '[]', '2025-01-01T00:00:00Z'),
        ('PYSEC-2025-1', '["GHSA-only"]', '2025-01-01T00:00:00Z')`,
    );
    await knowledge.query(
      `INSERT INTO nvd (nvd_id, metrics, published) VALUES ('CVE-2025-0005', '{}', '2025-01-02T00:00:00Z')`,
    );
    await knowledge.query(
      `INSERT INTO gcve (gcve_id, cve_id, metrics, date_published) VALUES ('GCVE-1-2025-7', 'CVE-2025-0006', '[]', '2025-01-03T00:00:00Z')`,
    );
    try {
      const after = await compare();

      expect(pair(after, "gcve", "nvd") - pair(before, "gcve", "nvd")).toBe(1);
      expect(pair(after, "gcve", "osv") - pair(before, "gcve", "osv")).toBe(1);
      expect(pair(after, "nvd", "osv") - pair(before, "nvd", "osv")).toBe(1);
      const osv = (r: typeof before) =>
        r.sources.find((s) => s.source === "osv")!;
      // GHSA-join and the GHSA-only group are one new vulnerability each.
      expect(osv(after).vulnerabilities - osv(before).vulnerabilities).toBe(2);
      expect(osv(after).only_source - osv(before).only_source).toBe(1);
    } finally {
      await knowledge.query(
        `DELETE FROM osv WHERE osv_id IN ('GHSA-join', 'GHSA-only', 'PYSEC-2025-1')`,
      );
      await knowledge.query(`DELETE FROM nvd WHERE nvd_id = 'CVE-2025-0005'`);
      await knowledge.query(`DELETE FROM gcve WHERE gcve_id = 'GCVE-1-2025-7'`);
    }
  });

  it("looks up the origin of each stored source match", async () => {
    const origins = await new SourceOriginService(knowledge).originsOf([
      { source: "osv", record_id: "GHSA-aaaa" },
      { source: "nvd", record_id: "CVE-2024-0001" },
      { source: "gcve", record_id: "GCVE-1-2024-0009" },
      {
        source: "friends_of_php",
        record_id: "FRIENDSOFPHP-vendor/pkg/CVE-2024-0001",
      },
      { source: "osv", record_id: "GHSA-missing" },
    ]);

    expect(Object.fromEntries(origins)).toEqual({
      "osv:GHSA-aaaa": "ghsa",
      "nvd:CVE-2024-0001": "cve-list",
      "gcve:GCVE-1-2024-0009": "gcve",
      "friends_of_php:FRIENDSOFPHP-vendor/pkg/CVE-2024-0001": "ghsa",
    });
  });
});
