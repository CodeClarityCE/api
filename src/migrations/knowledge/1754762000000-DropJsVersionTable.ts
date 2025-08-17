import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropJsVersionTable1754762000000 implements MigrationInterface {
    name = 'DropJsVersionTable1754762000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the obsolete js_version table since all data has been migrated to the generic version table
        await queryRunner.query(`DROP TABLE IF EXISTS "js_version" CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Recreate js_version table and migrate JavaScript versions back from generic version table
        await queryRunner.query(`
            CREATE TABLE "js_version" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "packageId" uuid,
                "version" character varying(255) NOT NULL,
                "dependencies" jsonb,
                "dev_dependencies" jsonb,
                "extra" jsonb,
                CONSTRAINT "PK_js_version_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_js_version_package" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE CASCADE
            )
        `);

        // Migrate JavaScript versions back from generic version table
        await queryRunner.query(`
            INSERT INTO "js_version" ("packageId", "version", "dependencies", "dev_dependencies", "extra")
            SELECT 
                v."package_id" as "packageId",
                v."version",
                v."dependencies",
                v."dev_dependencies", 
                v."extra"
            FROM "version" v
            INNER JOIN "package" p ON p.id = v.package_id
            WHERE p.language = 'javascript'
        `);
    }
}
