import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLanguageAgnosticPackageVersionTables1754758000000 implements MigrationInterface {
    name = 'AddLanguageAgnosticPackageVersionTables1754758000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add language field to existing package table
        await queryRunner.query(`
            ALTER TABLE "package" ADD COLUMN "language" character varying(50) DEFAULT 'javascript'
        `);

        // Create index on language field
        await queryRunner.query(`
            CREATE INDEX "IDX_package_language" ON "package" ("language")
        `);

        // Update unique constraint to include language (drop old unique constraint first)
        await queryRunner.query(`
            DROP INDEX "IDX_b23e12326a4218d09bd72301aa"
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_package_name_language" ON "package" ("name", "language")
        `);

        // Create generic version table to replace js_version
        await queryRunner.query(`
            CREATE TABLE "version" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "package_id" uuid NOT NULL,
                "version" character varying(255) NOT NULL,
                "dependencies" jsonb,
                "dev_dependencies" jsonb,
                "extra" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_version_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_version_package" FOREIGN KEY ("package_id") REFERENCES "package"("id") ON DELETE CASCADE
            )
        `);

        // Create indexes for efficient querying
        await queryRunner.query(`
            CREATE INDEX "IDX_version_package_id" ON "version" ("package_id")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_version_version" ON "version" ("version")
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_version_unique" ON "version" ("package_id", "version")
        `);

        // Add GIN index for JSONB columns for efficient JSON queries
        await queryRunner.query(`
            CREATE INDEX "IDX_version_dependencies_gin" ON "version" USING gin ("dependencies")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_version_extra_gin" ON "version" USING gin ("extra")
        `);

        // Migrate data from js_version to new version table
        await queryRunner.query(`
            INSERT INTO "version" ("package_id", "version", "dependencies", "dev_dependencies", "extra")
            SELECT 
                jv."packageId" as package_id,
                jv."version",
                jv."dependencies",
                jv."dev_dependencies", 
                jv."extra"
            FROM "js_version" jv
            WHERE jv."packageId" IS NOT NULL
        `);

        // Update all existing packages to have 'javascript' language
        await queryRunner.query(`
            UPDATE "package" SET "language" = 'javascript' WHERE "language" IS NULL
        `);

        // Make language field not nullable after setting default values
        await queryRunner.query(`
            ALTER TABLE "package" ALTER COLUMN "language" SET NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove indexes
        await queryRunner.query(`DROP INDEX "IDX_version_extra_gin"`);
        await queryRunner.query(`DROP INDEX "IDX_version_dependencies_gin"`);
        await queryRunner.query(`DROP INDEX "IDX_version_unique"`);
        await queryRunner.query(`DROP INDEX "IDX_version_version"`);
        await queryRunner.query(`DROP INDEX "IDX_version_package_id"`);

        // Drop new table
        await queryRunner.query(`DROP TABLE "version"`);

        // Restore original package table structure
        await queryRunner.query(`DROP INDEX "IDX_package_name_language"`);
        await queryRunner.query(`DROP INDEX "IDX_package_language"`);
        await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "language"`);

        // Restore original unique constraint
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_b23e12326a4218d09bd72301aa" ON "package" ("name")
        `);
    }
}
