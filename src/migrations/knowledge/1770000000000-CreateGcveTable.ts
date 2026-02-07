import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGcveTable1770000000000 implements MigrationInterface {
  name = "CreateGcveTable1770000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'gcve'
    `);

    if (tableExists && tableExists.length > 0) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "gcve" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "gcve_id" character varying NOT NULL,
        "cve_id" character varying,
        "data_version" character varying,
        "state" character varying,
        "date_published" character varying,
        "date_updated" character varying,
        "assigner_org_id" character varying,
        "descriptions" jsonb DEFAULT '[]',
        "affected" jsonb DEFAULT '[]',
        "affected_flattened" jsonb DEFAULT '[]',
        "metrics" jsonb DEFAULT '[]',
        "problem_types" jsonb DEFAULT '[]',
        "references" jsonb DEFAULT '[]',
        "adp_enrichments" jsonb DEFAULT '[]',
        "cwes" text[] DEFAULT '{}',
        "vlai_score" character varying DEFAULT '',
        "vlai_confidence" double precision DEFAULT 0,
        CONSTRAINT "PK_gcve" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gcve_gcve_id" UNIQUE ("gcve_id")
      )
    `);

    // GIN index for affected_flattened JSONB containment queries
    await queryRunner.query(
      `CREATE INDEX "gcve_affected_flattened_gin_pathops_idx" ON "gcve" USING gin ("affected_flattened" jsonb_path_ops)`,
    );

    // Partial index on cve_id for cross-referencing with NVD/OSV
    await queryRunner.query(
      `CREATE INDEX "IDX_gcve_cve_id" ON "gcve" ("cve_id") WHERE "cve_id" IS NOT NULL`,
    );

    // Index on state for filtering PUBLISHED records
    await queryRunner.query(
      `CREATE INDEX "IDX_gcve_state" ON "gcve" ("state")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gcve_state"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gcve_cve_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "gcve_affected_flattened_gin_pathops_idx"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "gcve"`);
  }
}
