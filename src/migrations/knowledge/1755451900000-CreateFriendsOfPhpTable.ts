import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFriendsOfPhpTable1755451900000 implements MigrationInterface {
    name = 'CreateFriendsOfPhpTable1755451900000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create UUID extension if not exists
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        
        // Create friends_of_php table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "friends_of_php" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "advisory_id" character varying NOT NULL,
                "title" character varying NOT NULL,
                "cve" character varying,
                "link" character varying NOT NULL,
                "reference" character varying NOT NULL,
                "composer" character varying,
                "description" text,
                "branches" jsonb NOT NULL DEFAULT '{}',
                "published" character varying NOT NULL,
                "modified" character varying NOT NULL,
                CONSTRAINT "PK_friends_of_php" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_friends_of_php_advisory_id" UNIQUE ("advisory_id")
            )
        `);

        // Create indexes for better query performance
        await queryRunner.query(`CREATE INDEX "IDX_friends_of_php_cve" ON "friends_of_php" ("cve")`);
        await queryRunner.query(`CREATE INDEX "IDX_friends_of_php_composer" ON "friends_of_php" ("composer")`);
        await queryRunner.query(`CREATE INDEX "IDX_friends_of_php_published" ON "friends_of_php" ("published")`);
        
        // Create GIN index for JSONB branches column for efficient queries
        await queryRunner.query(`CREATE INDEX "IDX_friends_of_php_branches_gin" ON "friends_of_php" USING gin ("branches")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_friends_of_php_branches_gin"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_friends_of_php_published"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_friends_of_php_composer"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_friends_of_php_cve"`);
        
        // Drop table
        await queryRunner.query(`DROP TABLE IF EXISTS "friends_of_php"`);
    }
}