import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1754648228805 implements MigrationInterface {
    name = 'Init1754648228805';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // This migration was incorrectly created with codeclarity database tables
        // The knowledge database should only contain knowledge-specific tables
        // All tables here have been removed as they belong in the codeclarity database

        // Re-create the OSV and NVD indexes if they don't already exist
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "osv_affected_gin_pathops_idx" ON "osv" ("affected") `
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "nvd_affectedflattened_gin_pathops_idx" ON "nvd" ("affectedFlattened") `
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the indexes that were created in the up method (if they exist)
        await queryRunner.query(
            `DROP INDEX IF EXISTS "public"."nvd_affectedflattened_gin_pathops_idx"`
        );
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."osv_affected_gin_pathops_idx"`);
    }
}
