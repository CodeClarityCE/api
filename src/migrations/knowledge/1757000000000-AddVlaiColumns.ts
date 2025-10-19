import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVlaiColumns1757000000000 implements MigrationInterface {
    name = 'AddVlaiColumns1757000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add vlai_score and vlai_confidence columns to osv table
        await queryRunner.query(`
            ALTER TABLE "osv"
            ADD COLUMN IF NOT EXISTS "vlai_score" character varying,
            ADD COLUMN IF NOT EXISTS "vlai_confidence" double precision
        `);

        // Add vlai_score and vlai_confidence columns to nvd table
        await queryRunner.query(`
            ALTER TABLE "nvd"
            ADD COLUMN IF NOT EXISTS "vlai_score" character varying,
            ADD COLUMN IF NOT EXISTS "vlai_confidence" double precision
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove vlai columns from nvd table
        await queryRunner.query(`
            ALTER TABLE "nvd"
            DROP COLUMN IF EXISTS "vlai_confidence",
            DROP COLUMN IF EXISTS "vlai_score"
        `);

        // Remove vlai columns from osv table
        await queryRunner.query(`
            ALTER TABLE "osv"
            DROP COLUMN IF EXISTS "vlai_confidence",
            DROP COLUMN IF EXISTS "vlai_score"
        `);
    }
}
