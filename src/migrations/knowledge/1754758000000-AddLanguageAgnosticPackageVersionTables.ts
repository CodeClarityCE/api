import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLanguageAgnosticPackageVersionTables1754758000000 implements MigrationInterface {
    name = 'AddLanguageAgnosticPackageVersionTables1754758000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create language-agnostic package_version table
        await queryRunner.query(`
            CREATE TABLE "package_version" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "ecosystem" character varying(50) NOT NULL,
                "package_name" character varying(255) NOT NULL,
                "version" character varying(100) NOT NULL,
                "metadata" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_package_version_id" PRIMARY KEY ("id")
            )
        `);

        // Create indexes for efficient querying
        await queryRunner.query(`
            CREATE INDEX "IDX_package_version_ecosystem" ON "package_version" ("ecosystem")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_package_version_package_name" ON "package_version" ("package_name")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_package_version_ecosystem_package_name" ON "package_version" ("ecosystem", "package_name")
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_package_version_unique" ON "package_version" ("ecosystem", "package_name", "version")
        `);

        // Create PHP-specific package metadata table
        await queryRunner.query(`
            CREATE TABLE "php_package_metadata" (
                "package_version_id" uuid NOT NULL,
                "php_version_constraint" character varying(100),
                "composer_type" character varying(50),
                "autoload" jsonb,
                "authors" jsonb,
                "license" jsonb,
                "keywords" jsonb,
                "homepage" character varying(255),
                "support" jsonb,
                "funding" jsonb,
                CONSTRAINT "PK_php_package_metadata" PRIMARY KEY ("package_version_id"),
                CONSTRAINT "FK_php_package_metadata_package_version" FOREIGN KEY ("package_version_id") REFERENCES "package_version"("id") ON DELETE CASCADE
            )
        `);

        // Create ecosystem-specific version indices for performance
        await queryRunner.query(`
            CREATE INDEX "IDX_package_version_npm" ON "package_version" ("package_name", "version") WHERE "ecosystem" = 'npm'
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_package_version_packagist" ON "package_version" ("package_name", "version") WHERE "ecosystem" = 'packagist'
        `);

        // Add GIN index for metadata JSONB column for efficient JSON queries
        await queryRunner.query(`
            CREATE INDEX "IDX_package_version_metadata_gin" ON "package_version" USING gin ("metadata")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes first
        await queryRunner.query(`DROP INDEX "IDX_package_version_metadata_gin"`);
        await queryRunner.query(`DROP INDEX "IDX_package_version_packagist"`);
        await queryRunner.query(`DROP INDEX "IDX_package_version_npm"`);
        await queryRunner.query(`DROP INDEX "IDX_package_version_unique"`);
        await queryRunner.query(`DROP INDEX "IDX_package_version_ecosystem_package_name"`);
        await queryRunner.query(`DROP INDEX "IDX_package_version_package_name"`);
        await queryRunner.query(`DROP INDEX "IDX_package_version_ecosystem"`);

        // Drop tables
        await queryRunner.query(`DROP TABLE "php_package_metadata"`);
        await queryRunner.query(`DROP TABLE "package_version"`);
    }
}