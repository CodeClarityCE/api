import { Client } from "pg";
import { DataSource } from "typeorm";

import { ExtendKnowledgeSoundTypes1794268800000 as Migration } from "../../src/migrations/knowledge/1794268800000-ExtendKnowledgeSoundTypes";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const knowledgeDb = `test_sound_types_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

describe("ExtendKnowledgeSoundTypes migration", () => {
  let knowledge: DataSource;

  const migrate = async (): Promise<void> => {
    const runner = knowledge.createQueryRunner();
    await new Migration().up(runner);
    await runner.release();
  };
  // Renders a converted column in UTC, down to the microsecond.
  const utc = async (
    table: string,
    column: string,
    key: string,
    id: string,
  ): Promise<string | null> => {
    const [row] = await knowledge.query(
      `SELECT to_char("${column}" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS value FROM "${table}" WHERE "${key}" = $1`,
      [id],
    );
    return row.value;
  };
  const addOsv = (
    id: string,
    dates: { modified?: string; published?: string; withdrawn?: string },
    aliases = "null",
  ): Promise<unknown> =>
    knowledge.query(
      `INSERT INTO osv (osv_id, modified, published, withdrawn, aliases) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        id,
        dates.modified ?? "2020-01-01T00:00:00Z",
        dates.published ?? "2020-01-01T00:00:00Z",
        dates.withdrawn ?? null,
        aliases,
      ],
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
        osv_id varchar NOT NULL UNIQUE,
        modified varchar, published varchar, withdrawn varchar,
        cve varchar, aliases jsonb
      )`);
    await knowledge.query(`
      CREATE TABLE nvd (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nvd_id varchar NOT NULL UNIQUE,
        published varchar, "lastModified" varchar
      )`);
    await knowledge.query(`
      CREATE TABLE gcve (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        gcve_id varchar NOT NULL UNIQUE,
        date_published varchar, date_updated varchar
      )`);
    await knowledge.query(`
      CREATE TABLE friends_of_php (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        advisory_id varchar NOT NULL UNIQUE,
        published varchar, modified varchar
      )`);
    await knowledge.query(
      `CREATE INDEX "IDX_friends_of_php_published" ON friends_of_php (published)`,
    );
    await knowledge.query(`
      CREATE TABLE epss (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cve varchar NOT NULL UNIQUE, score float, percentile float
      )`);
  });

  afterEach(async () => {
    await knowledge.destroy();
    await admin(`DROP DATABASE ${knowledgeDb}`);
  });

  describe("date conversion", () => {
    it("converts all four OSV formats to timestamptz", async () => {
      await addOsv("GHSA-seconds", { modified: "2019-12-20T02:08:50Z" });
      await addOsv("GHSA-millis", { modified: "2023-11-08T03:58:04.557Z" });
      await addOsv("GHSA-micros", {
        modified: "2022-01-09T11:37:01.199689Z",
      });
      await addOsv("GHSA-nanos", {
        modified: "2026-03-23T05:06:54.289219582Z",
      });

      await migrate();

      expect(await utc("osv", "modified", "osv_id", "GHSA-seconds")).toBe(
        "2019-12-20 02:08:50.000000",
      );
      expect(await utc("osv", "modified", "osv_id", "GHSA-millis")).toBe(
        "2023-11-08 03:58:04.557000",
      );
      expect(await utc("osv", "modified", "osv_id", "GHSA-micros")).toBe(
        "2022-01-09 11:37:01.199689",
      );
      expect(await utc("osv", "modified", "osv_id", "GHSA-nanos")).toBe(
        "2026-03-23 05:06:54.289220",
      );
    });

    it("turns an empty date into NULL without reporting it", async () => {
      await addOsv("GHSA-active", { withdrawn: "" });

      await migrate();

      expect(await utc("osv", "withdrawn", "osv_id", "GHSA-active")).toBeNull();
      expect(
        await knowledge.query(`SELECT * FROM knowledge_date_conversion_issue`),
      ).toEqual([]);
    });

    it("reads dates without an offset as UTC whatever the session time zone", async () => {
      await knowledge.query(`SET TIME ZONE 'Asia/Tokyo'`);
      await knowledge.query(
        `INSERT INTO nvd (nvd_id, published, "lastModified") VALUES ('CVE-2023-1', '1988-10-01T04:00:00.000', '2023-11-07T01:54:53.530')`,
      );
      await knowledge.query(
        `INSERT INTO gcve (gcve_id, date_published, date_updated) VALUES ('GCVE-1', '2022-09-05T09:50:09', '2024-07-31T13:05:37.090Z')`,
      );
      await knowledge.query(
        `INSERT INTO friends_of_php (advisory_id, published, modified) VALUES ('PKSA-1', '2011-09-25 00:00:00', '2026-08-29T16:33:29+02:00')`,
      );

      await migrate();

      expect(await utc("nvd", "published", "nvd_id", "CVE-2023-1")).toBe(
        "1988-10-01 04:00:00.000000",
      );
      expect(await utc("nvd", "lastModified", "nvd_id", "CVE-2023-1")).toBe(
        "2023-11-07 01:54:53.530000",
      );
      expect(await utc("gcve", "date_published", "gcve_id", "GCVE-1")).toBe(
        "2022-09-05 09:50:09.000000",
      );
      expect(await utc("gcve", "date_updated", "gcve_id", "GCVE-1")).toBe(
        "2024-07-31 13:05:37.090000",
      );
      expect(
        await utc("friends_of_php", "published", "advisory_id", "PKSA-1"),
      ).toBe("2011-09-25 00:00:00.000000");
      expect(
        await utc("friends_of_php", "modified", "advisory_id", "PKSA-1"),
      ).toBe("2026-08-29 14:33:29.000000");
    });

    it("reports unparseable dates and still converts the rest", async () => {
      await addOsv("GHSA-bad", {
        modified: "not-a-date",
        published: "2024-13-45T00:00:00Z",
        withdrawn: "now",
      });
      await addOsv("GHSA-good", { modified: "2019-12-20T02:08:50Z" });
      const [{ id }] = await knowledge.query(
        `SELECT id FROM osv WHERE osv_id = 'GHSA-bad'`,
      );

      await migrate();

      expect(await utc("osv", "modified", "osv_id", "GHSA-bad")).toBeNull();
      expect(await utc("osv", "published", "osv_id", "GHSA-bad")).toBeNull();
      expect(await utc("osv", "withdrawn", "osv_id", "GHSA-bad")).toBeNull();
      expect(await utc("osv", "modified", "osv_id", "GHSA-good")).toBe(
        "2019-12-20 02:08:50.000000",
      );
      expect(
        await knowledge.query(
          `SELECT source_table, record_id, column_name, raw_value FROM knowledge_date_conversion_issue ORDER BY column_name`,
        ),
      ).toEqual([
        {
          source_table: "osv",
          record_id: id,
          column_name: "modified",
          raw_value: "not-a-date",
        },
        {
          source_table: "osv",
          record_id: id,
          column_name: "published",
          raw_value: "2024-13-45T00:00:00Z",
        },
        {
          source_table: "osv",
          record_id: id,
          column_name: "withdrawn",
          raw_value: "now",
        },
      ]);
    });

    it("changes every date column to timestamptz", async () => {
      await migrate();

      const columns = await knowledge.query(`
        SELECT table_name || '.' || column_name AS name, data_type
        FROM information_schema.columns
        WHERE (table_name, column_name) IN (
          ('osv', 'modified'), ('osv', 'published'), ('osv', 'withdrawn'),
          ('nvd', 'published'), ('nvd', 'lastModified'),
          ('gcve', 'date_published'), ('gcve', 'date_updated'),
          ('friends_of_php', 'published'), ('friends_of_php', 'modified')
        )`);

      expect(columns).toHaveLength(9);
      for (const column of columns) {
        expect(column.data_type).toBe("timestamp with time zone");
      }
    });
  });

  describe("retirement", () => {
    it.each([
      ["osv", "osv_id"],
      ["nvd", "nvd_id"],
      ["gcve", "gcve_id"],
      ["friends_of_php", "advisory_id"],
    ])("lets %s records carry a reason and date", async (table, key) => {
      await migrate();
      await knowledge.query(
        `INSERT INTO "${table}" ("${key}", retired_reason, retired_at) VALUES ('X-1', 'withdrawn', '2026-01-02T03:04:05Z')`,
      );

      expect(await utc(table, "retired_at", key, "X-1")).toBe(
        "2026-01-02 03:04:05.000000",
      );
    });

    it("leaves existing records active", async () => {
      await addOsv("GHSA-active", {});

      await migrate();

      expect(
        await knowledge.query(`SELECT retired_reason, retired_at FROM osv`),
      ).toEqual([{ retired_reason: null, retired_at: null }]);
    });

    it("rejects an unknown reason and a reason without a date", async () => {
      await migrate();

      await expect(
        knowledge.query(
          `INSERT INTO osv (osv_id, retired_reason, retired_at) VALUES ('X-1', 'bored', now())`,
        ),
      ).rejects.toThrow(/CHK_osv_retired_reason/);
      await expect(
        knowledge.query(
          `INSERT INTO osv (osv_id, retired_reason) VALUES ('X-2', 'removed')`,
        ),
      ).rejects.toThrow(/CHK_osv_retired_together/);
    });
  });

  describe("advisory kind", () => {
    it("marks MAL records malicious and the rest vulnerabilities", async () => {
      await addOsv("MAL-2024-1", {});
      await addOsv("GHSA-aaaa", {});

      await migrate();

      expect(
        await knowledge.query(`SELECT osv_id, kind FROM osv ORDER BY osv_id`),
      ).toEqual([
        { osv_id: "GHSA-aaaa", kind: "vulnerability" },
        { osv_id: "MAL-2024-1", kind: "malicious" },
      ]);
    });

    it("defaults new records to vulnerability and rejects unknown kinds", async () => {
      await migrate();
      await addOsv("GHSA-new", {});

      expect(await knowledge.query(`SELECT kind FROM osv`)).toEqual([
        { kind: "vulnerability" },
      ]);
      await expect(
        knowledge.query(`UPDATE osv SET kind = 'spicy'`),
      ).rejects.toThrow(/CHK_osv_kind/);
    });
  });

  describe("EPSS score date", () => {
    it("adds an empty score_date of type date", async () => {
      await knowledge.query(
        `INSERT INTO epss (cve, score) VALUES ('CVE-2024-1', 0.5)`,
      );

      await migrate();
      await knowledge.query(
        `UPDATE epss SET score_date = '2026-11-08' WHERE cve = 'CVE-2024-1'`,
      );

      const [row] = await knowledge.query(
        `SELECT score_date::text AS score_date, pg_typeof(score_date)::text AS type FROM epss`,
      );
      expect(row).toEqual({ score_date: "2026-11-08", type: "date" });
    });
  });

  describe("CVE aliases", () => {
    const multi = `["GHSA-73jg-4qh6-3f4g", "CVE-2023-51651", "CVE-2025-69820"]`;

    it("finds an advisory by any of its CVE aliases", async () => {
      await addOsv("GHSA-557v", {}, multi);

      await migrate();

      for (const cve of ["CVE-2023-51651", "CVE-2025-69820"]) {
        const found = await knowledge.query(
          `SELECT osv_id FROM osv WHERE cve_aliases ? $1`,
          [cve],
        );
        expect(found).toEqual([{ osv_id: "GHSA-557v" }]);
      }
    });

    it("keeps only CVE identifiers and gives an empty list without aliases", async () => {
      await addOsv("GHSA-557v", {}, multi);
      await addOsv("MAL-2024-1", {}, "null");
      await knowledge.query(`INSERT INTO osv (osv_id) VALUES ('GHSA-none')`);

      await migrate();

      expect(
        await knowledge.query(
          `SELECT osv_id, cve_aliases FROM osv ORDER BY osv_id`,
        ),
      ).toEqual([
        {
          osv_id: "GHSA-557v",
          cve_aliases: ["CVE-2023-51651", "CVE-2025-69820"],
        },
        { osv_id: "GHSA-none", cve_aliases: [] },
        { osv_id: "MAL-2024-1", cve_aliases: [] },
      ]);
    });

    it("stays current when aliases change", async () => {
      await migrate();
      await addOsv("GHSA-557v", {}, `["CVE-2020-1"]`);

      await knowledge.query(`UPDATE osv SET aliases = '["CVE-2020-2"]'::jsonb`);

      expect(await knowledge.query(`SELECT cve_aliases FROM osv`)).toEqual([
        { cve_aliases: ["CVE-2020-2"] },
      ]);
    });
  });

  it("restores the previous shape on down", async () => {
    await addOsv("GHSA-seconds", { modified: "2019-12-20T02:08:50Z" });
    await migrate();

    const runner = knowledge.createQueryRunner();
    await new Migration().down(runner);
    await runner.release();

    const [row] = await knowledge.query(`SELECT modified FROM osv`);
    expect(row.modified).toBe("2019-12-20T02:08:50.000000Z");
    const added = await knowledge.query(`
      SELECT column_name FROM information_schema.columns
      WHERE column_name IN ('retired_reason', 'retired_at', 'kind', 'cve_aliases', 'score_date')`);
    expect(added).toEqual([]);
    expect(
      await knowledge.query(
        `SELECT to_regclass('knowledge_date_conversion_issue') AS name`,
      ),
    ).toEqual([{ name: null }]);
  });
});
