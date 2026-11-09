import { MigrationInterface, QueryRunner } from "typeorm";

import { CodeClarityLogger } from "../../services/logger.service";

// Date columns stored as text, by table.
const DATE_COLUMNS: Record<string, string[]> = {
  osv: ["modified", "published", "withdrawn"],
  nvd: ["published", "lastModified"],
  gcve: ["date_published", "date_updated"],
  friends_of_php: ["published", "modified"],
};

// Advisory tables whose records can be retired.
const ADVISORY_TABLES = ["osv", "nvd", "gcve", "friends_of_php"];

const logger = CodeClarityLogger.forService("knowledge-migrations");

export class ExtendKnowledgeSoundTypes1794268800000 implements MigrationInterface {
  name = "ExtendKnowledgeSoundTypes1794268800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.convertDates(queryRunner);
    await this.addRetirement(queryRunner);
    await this.addAdvisoryKind(queryRunner);
    await queryRunner.query(`ALTER TABLE "epss" ADD COLUMN "score_date" date`);
    await this.addCveAliases(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_osv_cve_aliases_gin"
    `);
    await queryRunner.query(
      `ALTER TABLE "osv" DROP COLUMN "cve_aliases", DROP COLUMN "kind"`,
    );
    await queryRunner.query(`ALTER TABLE "epss" DROP COLUMN "score_date"`);
    for (const table of ADVISORY_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN "retired_reason", DROP COLUMN "retired_at"`,
      );
    }
    for (const [table, columns] of Object.entries(DATE_COLUMNS)) {
      const changes = columns.map(
        (column) =>
          `ALTER COLUMN "${column}" TYPE character varying USING to_char("${column}" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" ${changes.join(", ")}`);
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS "knowledge_date_conversion_issue"`,
    );
  }

  private async addRetirement(queryRunner: QueryRunner): Promise<void> {
    for (const table of ADVISORY_TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN "retired_reason" character varying,
          ADD COLUMN "retired_at" timestamptz,
          ADD CONSTRAINT "CHK_${table}_retired_reason"
            CHECK ("retired_reason" IN ('rejected', 'withdrawn', 'removed')),
          ADD CONSTRAINT "CHK_${table}_retired_together"
            CHECK (("retired_reason" IS NULL) = ("retired_at" IS NULL))
      `);
    }
  }

  private async addAdvisoryKind(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "osv"
        ADD COLUMN "kind" character varying NOT NULL DEFAULT 'vulnerability',
        ADD CONSTRAINT "CHK_osv_kind"
          CHECK ("kind" IN ('vulnerability', 'malicious'))
    `);
    await queryRunner.query(
      `UPDATE "osv" SET "kind" = 'malicious' WHERE "osv_id" LIKE 'MAL-%'`,
    );
  }

  // Postgres keeps this list in step with aliases, so importers need no change.
  private async addCveAliases(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "osv" ADD COLUMN "cve_aliases" jsonb
        GENERATED ALWAYS AS (
          COALESCE(
            jsonb_path_query_array("aliases", '$[*] ? (@ starts with "CVE-")'),
            '[]'::jsonb
          )
        ) STORED
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_osv_cve_aliases_gin" ON "osv" USING gin ("cve_aliases")`,
    );
  }

  private async convertDates(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "knowledge_date_conversion_issue" (
        "source_table" character varying NOT NULL,
        "record_id" uuid NOT NULL,
        "column_name" character varying NOT NULL,
        "raw_value" text NOT NULL,
        "reported_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE FUNCTION pg_temp.knowledge_timestamp(raw text) RETURNS timestamptz
      LANGUAGE plpgsql SET timezone = 'UTC' AS $$
      BEGIN
        -- The shape check stops Postgres accepting words such as 'now'.
        IF raw !~ '^\\d{4}-\\d{2}-\\d{2}([T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}(:?\\d{2})?)?)?$' THEN
          RETURN NULL;
        END IF;
        RETURN raw::timestamptz;
      EXCEPTION WHEN others THEN
        RETURN NULL;
      END
      $$
    `);

    for (const [table, columns] of Object.entries(DATE_COLUMNS)) {
      for (const column of columns) {
        await queryRunner.query(`
          INSERT INTO "knowledge_date_conversion_issue"
            ("source_table", "record_id", "column_name", "raw_value")
          SELECT '${table}', "id", '${column}', "${column}"
          FROM "${table}"
          WHERE btrim("${column}") <> ''
            AND pg_temp.knowledge_timestamp("${column}") IS NULL
        `);
      }
      const changes = columns.map(
        (column) =>
          `ALTER COLUMN "${column}" TYPE timestamptz USING pg_temp.knowledge_timestamp("${column}")`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" ${changes.join(", ")}`);
    }
    await queryRunner.query(`DROP FUNCTION pg_temp.knowledge_timestamp(text)`);

    const [{ total }] = await queryRunner.query(
      `SELECT count(*) AS total FROM "knowledge_date_conversion_issue"`,
    );
    if (Number(total) > 0) {
      logger.warn(
        `${total} knowledge dates could not be converted; see knowledge_date_conversion_issue`,
      );
    }
  }
}
