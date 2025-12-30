import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1754648228805 implements MigrationInterface {
  name = "Init1754648228805";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration was incorrectly created with codeclarity database tables
    // The knowledge database should only contain knowledge-specific tables
    // All tables here have been removed as they belong in the codeclarity database

    // Check if tables exist (they are created by Go knowledge service, not TypeORM)
    // If tables don't exist yet, skip index creation - they'll be indexed when populated
    const osvTableExists = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'osv'
    `);

    if (osvTableExists && osvTableExists.length > 0) {
      const osvIndexExists = await queryRunner.query(`
        SELECT 1 FROM pg_indexes WHERE indexname = 'osv_affected_gin_pathops_idx'
      `);

      if (!osvIndexExists || osvIndexExists.length === 0) {
        await queryRunner.query(
          `CREATE INDEX "osv_affected_gin_pathops_idx" ON "osv" USING gin ("affected" jsonb_path_ops)`,
        );
      }
    }

    const nvdTableExists = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'nvd'
    `);

    if (nvdTableExists && nvdTableExists.length > 0) {
      const nvdIndexExists = await queryRunner.query(`
        SELECT 1 FROM pg_indexes WHERE indexname = 'nvd_affectedflattened_gin_pathops_idx'
      `);

      if (!nvdIndexExists || nvdIndexExists.length === 0) {
        await queryRunner.query(
          `CREATE INDEX "nvd_affectedflattened_gin_pathops_idx" ON "nvd" USING gin ("affectedFlattened" jsonb_path_ops)`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the indexes that were created in the up method (if they exist)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."nvd_affectedflattened_gin_pathops_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."osv_affected_gin_pathops_idx"`,
    );
  }
}
