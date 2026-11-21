import { MigrationInterface, QueryRunner } from "typeorm";

// The CISA Known Exploited Vulnerabilities catalog, one row per CVE, and its sync state.
export class CreateKevTable1795651200000 implements MigrationInterface {
  name = "CreateKevTable1795651200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kev" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cve" character varying NOT NULL,
        "vendor_project" character varying,
        "product" character varying,
        "vulnerability_name" character varying,
        "date_added" date NOT NULL,
        "due_date" date,
        "short_description" text,
        "required_action" text,
        "notes" text,
        "known_ransomware_use" boolean NOT NULL DEFAULT false,
        "cwes" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_kev" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kev_cve" UNIQUE ("cve")
      )
    `);
    await queryRunner.query(
      `INSERT INTO "knowledge_source_sync" ("source") VALUES ('kev') ON CONFLICT ("source") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "knowledge_source_sync" WHERE "source" = 'kev'`,
    );
    await queryRunner.query(`DROP TABLE "kev"`);
  }
}
