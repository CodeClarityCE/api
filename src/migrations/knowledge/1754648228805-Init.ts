import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1754648228805 implements MigrationInterface {
  name = "Init1754648228805";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration was incorrectly created with codeclarity database tables
    // The knowledge database should only contain knowledge-specific tables
    // All tables here have been removed as they belong in the codeclarity database

    // Check if indexes already exist (from database restore) before creating
    // This prevents errors when the database is restored from dumps
    const osvIndexExists = await queryRunner.query(`
            SELECT 1 FROM pg_indexes WHERE indexname = 'osv_affected_gin_pathops_idx'
        `);

    if (!osvIndexExists || osvIndexExists.length === 0) {
      await queryRunner.query(
        `CREATE INDEX "osv_affected_gin_pathops_idx" ON "osv" USING gin ("affected" jsonb_path_ops)`,
      );
    }

    const nvdIndexExists = await queryRunner.query(`
            SELECT 1 FROM pg_indexes WHERE indexname = 'nvd_affectedflattened_gin_pathops_idx'
        `);

    if (!nvdIndexExists || nvdIndexExists.length === 0) {
      await queryRunner.query(
        `CREATE INDEX "nvd_affectedflattened_gin_pathops_idx" ON "nvd" USING gin ("affectedFlattened" jsonb_path_ops)`,
      );
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
