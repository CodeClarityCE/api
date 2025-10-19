import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEpssTable1757100000000 implements MigrationInterface {
    name = 'AddEpssTable1757100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if epss table already exists
        const tableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'epss'
            );
        `);

        if (!tableExists[0].exists) {
            // Create epss table
            await queryRunner.query(`
                CREATE TABLE "epss" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "cve" character varying NOT NULL,
                    "score" double precision,
                    "percentile" double precision,
                    CONSTRAINT "PK_3849ad9c24a83f52032bdd766d6" PRIMARY KEY ("id")
                )
            `);

            // Create unique index on cve column
            await queryRunner.query(`
                CREATE UNIQUE INDEX "IDX_9cc3075a662b00d9b3b6d1590f" ON "epss" ("cve")
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the index first
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_9cc3075a662b00d9b3b6d1590f"`);

        // Drop the table
        await queryRunner.query(`DROP TABLE IF EXISTS "epss"`);
    }
}
