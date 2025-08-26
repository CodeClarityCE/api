import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1754648240560 implements MigrationInterface {
    name = 'Init1754648240560';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create plugin table
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "plugin" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "version" character varying, "description" character varying, "depends_on" jsonb, "config" jsonb, CONSTRAINT "PK_26c98f1bfcce9906f8bb0b11e5b" PRIMARY KEY ("id"))`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "plugin"`);
    }
}
