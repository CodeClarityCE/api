import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1754648057399 implements MigrationInterface {
    name = 'Init1754648057399';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "plugin" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "version" character varying, "description" character varying, "depends_on" jsonb, "config" jsonb, CONSTRAINT "PK_9a65387180b2e67287345684c03" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "package" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "description" character varying(255), "homepage" character varying(255), "latest_version" character varying(255) NOT NULL, "time" TIMESTAMP WITH TIME ZONE, "keywords" text, "source" jsonb, "license" character varying(50), "licenses" jsonb, "extra" jsonb, CONSTRAINT "PK_308364c66df656295bc4ec467c2" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b23e12326a4218d09bd72301aa" ON "package" ("name") `
        );
        await queryRunner.query(
            `CREATE TABLE "js_version" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "version" character varying(255) NOT NULL, "dependencies" jsonb, "dev_dependencies" jsonb, "extra" jsonb, "packageId" uuid, CONSTRAINT "PK_48f51bbe5c448d86db28db71f12" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE INDEX "idx_js_version_version" ON "js_version" ("version") `
        );
        await queryRunner.query(
            `CREATE TABLE "osv" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "osv_id" character varying NOT NULL, "schema_version" character varying, "vlai_score" character varying, "vlai_confidence" double precision, "modified" character varying, "published" character varying, "withdrawn" character varying, "summary" character varying, "details" character varying, "cve" character varying, "aliases" jsonb, "related" jsonb, "severity" jsonb, "affected" jsonb, "references" jsonb, "credits" jsonb, "database_specific" jsonb, "cwes" jsonb, CONSTRAINT "PK_f8e9d331bbbcee401c05ec8481e" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_a1a455434143cac56134910e0b" ON "osv" ("osv_id") `
        );
        await queryRunner.query(
            `CREATE TABLE "nvd" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nvd_id" character varying NOT NULL, "sourceIdentifier" character varying, "published" character varying, "lastModified" character varying, "vulnStatus" character varying, "descriptions" jsonb, "vlai_score" character varying, "vlai_confidence" double precision, "metrics" jsonb, "weaknesses" jsonb, "configurations" jsonb, "affectedFlattened" jsonb, "affected" jsonb, "references" jsonb, CONSTRAINT "PK_843fa8d16ab777718211ba39ea6" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ff27e0c5a71cd3d2b6623d4631" ON "nvd" ("nvd_id") `
        );
        await queryRunner.query(
            `CREATE TABLE "cwe" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cwe_id" character varying NOT NULL, "name" character varying, "abstraction" character varying, "structure" character varying, "status" character varying, "description" character varying, "extended_description" character varying, "likelihood_of_exploit" character varying, "related_weaknesses" jsonb, "modes_of_introduction" jsonb, "common_consequences" jsonb, "detection_methods" jsonb, "potential_mitigations" jsonb, "taxonomy_mappings" jsonb, "observed_examples" jsonb, "alternate_terms" jsonb, "affected_resources" jsonb, "functional_areas" jsonb, "categories" jsonb, "applicable_platforms" jsonb, CONSTRAINT "PK_da4d150c7412f06c7ee5fee61df" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_129e04e01810e12ea16e48b275" ON "cwe" ("cwe_id") `
        );
        await queryRunner.query(
            `CREATE TABLE "licenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(250), "reference" character varying(250), "isDeprecatedLicenseId" boolean, "detailsUrl" character varying, "referenceNumber" integer, "licenseId" character varying, "seeAlso" text, "isOsiApproved" boolean, "details" jsonb, CONSTRAINT "PK_da5021501ce80efa03de6f40086" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(`CREATE INDEX "idx_license_name" ON "licenses" ("name") `);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_d48c4e23bf4cc989ccc9598b39" ON "licenses" ("licenseId") `
        );
        await queryRunner.query(
            `CREATE TABLE "epss" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cve" character varying NOT NULL, "score" double precision, "percentile" double precision, CONSTRAINT "PK_3849ad9c24a83f52032bdd766d6" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_9cc3075a662b00d9b3b6d1590f" ON "epss" ("cve") `
        );
        await queryRunner.query(
            `ALTER TABLE "result" ADD "created_on" TIMESTAMP NOT NULL DEFAULT now()`
        );
        await queryRunner.query(
            `CREATE TYPE "public"."analysis_schedule_type_enum" AS ENUM('once', 'daily', 'weekly')`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD "schedule_type" "public"."analysis_schedule_type_enum" DEFAULT 'once'`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD "next_scheduled_run" TIMESTAMP WITH TIME ZONE`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD "is_active" boolean NOT NULL DEFAULT true`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD "last_scheduled_run" TIMESTAMP WITH TIME ZONE`
        );
        await queryRunner.query(
            `ALTER TABLE "js_version" ADD CONSTRAINT "FK_db3d7c4b2252809ded17121804e" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "js_version" DROP CONSTRAINT "FK_db3d7c4b2252809ded17121804e"`
        );
        await queryRunner.query(`ALTER TABLE "analysis" DROP COLUMN "last_scheduled_run"`);
        await queryRunner.query(`ALTER TABLE "analysis" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "analysis" DROP COLUMN "next_scheduled_run"`);
        await queryRunner.query(`ALTER TABLE "analysis" DROP COLUMN "schedule_type"`);
        await queryRunner.query(`DROP TYPE "public"."analysis_schedule_type_enum"`);
        await queryRunner.query(`ALTER TABLE "result" DROP COLUMN "created_on"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9cc3075a662b00d9b3b6d1590f"`);
        await queryRunner.query(`DROP TABLE "epss"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d48c4e23bf4cc989ccc9598b39"`);
        await queryRunner.query(`DROP INDEX "public"."idx_license_name"`);
        await queryRunner.query(`DROP TABLE "licenses"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_129e04e01810e12ea16e48b275"`);
        await queryRunner.query(`DROP TABLE "cwe"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff27e0c5a71cd3d2b6623d4631"`);
        await queryRunner.query(`DROP TABLE "nvd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a1a455434143cac56134910e0b"`);
        await queryRunner.query(`DROP TABLE "osv"`);
        await queryRunner.query(`DROP INDEX "public"."idx_js_version_version"`);
        await queryRunner.query(`DROP TABLE "js_version"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b23e12326a4218d09bd72301aa"`);
        await queryRunner.query(`DROP TABLE "package"`);
        await queryRunner.query(`DROP TABLE "plugin"`);
    }
}
