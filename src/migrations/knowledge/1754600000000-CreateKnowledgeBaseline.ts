import { MigrationInterface, QueryRunner } from "typeorm";

// Tables of the 2025-05-27 knowledge dump, which every later migration builds on.
const BASE_TABLES = ["cwe", "js_version", "licenses", "nvd", "osv", "package"];

// The dump's schema, so an empty database ends up like a restored one.
const BASE_SCHEMA = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`,
  `CREATE TABLE "cwe" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "cwe_id" character varying NOT NULL,
    "name" character varying,
    "abstraction" character varying,
    "structure" character varying,
    "status" character varying,
    "description" character varying,
    "extended_description" character varying,
    "likelihood_of_exploit" character varying,
    "related_weaknesses" jsonb,
    "modes_of_introduction" jsonb,
    "common_consequences" jsonb,
    "detection_methods" jsonb,
    "potential_mitigations" jsonb,
    "taxonomy_mappings" jsonb,
    "observed_examples" jsonb,
    "alternate_terms" jsonb,
    "affected_resources" jsonb,
    "functional_areas" jsonb,
    "categories" jsonb,
    "applicable_platforms" jsonb,
    CONSTRAINT "PK_da4d150c7412f06c7ee5fee61df" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "js_version" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "version" character varying(255) NOT NULL,
    "dependencies" jsonb,
    "dev_dependencies" jsonb,
    "extra" jsonb,
    "packageId" uuid,
    CONSTRAINT "PK_48f51bbe5c448d86db28db71f12" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "licenses" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "name" character varying(250),
    "reference" character varying(250),
    "isDeprecatedLicenseId" boolean,
    "detailsUrl" character varying,
    "referenceNumber" integer,
    "licenseId" character varying,
    "seeAlso" text,
    "isOsiApproved" boolean,
    "details" jsonb,
    CONSTRAINT "PK_da5021501ce80efa03de6f40086" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "nvd" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "nvd_id" character varying NOT NULL,
    "sourceIdentifier" character varying,
    "published" character varying,
    "lastModified" character varying,
    "vulnStatus" character varying,
    "descriptions" jsonb,
    "metrics" jsonb,
    "weaknesses" jsonb,
    "configurations" jsonb,
    "affectedFlattened" jsonb,
    "affected" jsonb,
    "references" jsonb,
    CONSTRAINT "PK_843fa8d16ab777718211ba39ea6" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "osv" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "osv_id" character varying NOT NULL,
    "schema_version" character varying,
    "modified" character varying,
    "published" character varying,
    "withdrawn" character varying,
    "summary" character varying,
    "details" character varying,
    "cve" character varying,
    "aliases" jsonb,
    "related" jsonb,
    "severity" jsonb,
    "affected" jsonb,
    "references" jsonb,
    "credits" jsonb,
    "database_specific" jsonb,
    "cwes" jsonb,
    CONSTRAINT "PK_f8e9d331bbbcee401c05ec8481e" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "package" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" character varying(255),
    "homepage" character varying(255),
    "latest_version" character varying(255) NOT NULL,
    "time" timestamp with time zone,
    "keywords" text,
    "source" jsonb,
    "license" character varying(50),
    "licenses" jsonb,
    "extra" jsonb,
    CONSTRAINT "PK_308364c66df656295bc4ec467c2" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX "IDX_129e04e01810e12ea16e48b275" ON "cwe" ("cwe_id")`,
  `CREATE UNIQUE INDEX "IDX_a1a455434143cac56134910e0b" ON "osv" ("osv_id")`,
  `CREATE UNIQUE INDEX "IDX_b23e12326a4218d09bd72301aa" ON "package" ("name")`,
  `CREATE UNIQUE INDEX "IDX_d48c4e23bf4cc989ccc9598b39" ON "licenses" ("licenseId")`,
  `CREATE UNIQUE INDEX "IDX_ff27e0c5a71cd3d2b6623d4631" ON "nvd" ("nvd_id")`,
  `CREATE INDEX "idx_js_version_version" ON "js_version" ("version")`,
  `CREATE INDEX "idx_license_name" ON "licenses" ("name")`,
  `ALTER TABLE "js_version" ADD CONSTRAINT "FK_db3d7c4b2252809ded17121804e" FOREIGN KEY ("packageId") REFERENCES "package"("id")`,
];

export class CreateKnowledgeBaseline1754600000000 implements MigrationInterface {
  name = "CreateKnowledgeBaseline1754600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A database restored from a dump or already migrated keeps its schema as is.
    const [found] = await queryRunner.query(
      `SELECT count(*)::int AS total FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [BASE_TABLES],
    );
    if (found.total > 0) {
      return;
    }
    for (const statement of BASE_SCHEMA) {
      await queryRunner.query(statement);
    }
  }

  // These tables may have come from a dump with live data, so reverting leaves them in place.
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Nothing to undo safely.
  }
}
