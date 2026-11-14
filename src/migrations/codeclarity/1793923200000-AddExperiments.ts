import { MigrationInterface, QueryRunner } from "typeorm";

// Experiments run one analyzer over every entry of a READY dataset
// (codeclarity_modules/experiments). A dataset with experiments cannot be
// deleted (RESTRICT); an analyzer can once no experiment still needs it, so
// that link is SET NULL. Constraint names are the ones TypeORM's default
// naming strategy derives, so a later migration:generate sees no drift.
export class AddExperiments1793923200000 implements MigrationInterface {
  name = "AddExperiments1793923200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."experiment_status_enum" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "experiment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "status" "public"."experiment_status_enum" NOT NULL DEFAULT 'PENDING', "retries" integer NOT NULL DEFAULT '2', "error" character varying(1000), "analyzer_steps" jsonb, "provenance" jsonb, "lease_owner" character varying(200), "lease_until" TIMESTAMP WITH TIME ZONE, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "started_on" TIMESTAMP WITH TIME ZONE, "ended_on" TIMESTAMP WITH TIME ZONE, "organizationId" uuid, "createdById" uuid, "datasetId" uuid NOT NULL, "analyzerId" uuid, CONSTRAINT "UQ_73bc7d7132b2fa253279e093f92" UNIQUE ("organizationId", "name"), CONSTRAINT "PK_4f6eec215c62eec1e0fde987caf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."experiment_run_status_enum" AS ENUM('pending', 'done', 'failed', 'skipped')`,
    );
    await queryRunner.query(
      `CREATE TABLE "experiment_run" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" "public"."experiment_run_status_enum" NOT NULL DEFAULT 'pending', "error" character varying(1000), "attempts" integer NOT NULL DEFAULT '0', "branch" character varying(255), "commit_hash" character varying(64), "committed_at" TIMESTAMP WITH TIME ZONE, "submitted_on" TIMESTAMP WITH TIME ZONE, "first_submitted_on" TIMESTAMP WITH TIME ZONE, "ended_on" TIMESTAMP WITH TIME ZONE, "experimentId" uuid, "datasetEntryId" uuid NOT NULL, "analysisId" uuid, CONSTRAINT "UQ_078a47b01b585a7fa86b09c5285" UNIQUE ("experimentId", "datasetEntryId"), CONSTRAINT "PK_fd542e718dcf0f9e916708f05d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" ADD CONSTRAINT "FK_0426779bd58d26cbe832c9af800" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" ADD CONSTRAINT "FK_b72e3a4d9515e85b78a09f3b988" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" ADD CONSTRAINT "FK_fb7ad1deb5cd1d961aa48926def" FOREIGN KEY ("datasetId") REFERENCES "dataset"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" ADD CONSTRAINT "FK_79369e914f482704157d86966f2" FOREIGN KEY ("analyzerId") REFERENCES "analyzer"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_50b04432c5809f2f5e93a882418" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_9764120dda53b69e96ad21d44b7" FOREIGN KEY ("datasetEntryId") REFERENCES "dataset_entry"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_3c0815cf510b863e5ddcdd00dd4" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP CONSTRAINT "FK_3c0815cf510b863e5ddcdd00dd4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP CONSTRAINT "FK_9764120dda53b69e96ad21d44b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP CONSTRAINT "FK_50b04432c5809f2f5e93a882418"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" DROP CONSTRAINT "FK_79369e914f482704157d86966f2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" DROP CONSTRAINT "FK_fb7ad1deb5cd1d961aa48926def"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" DROP CONSTRAINT "FK_b72e3a4d9515e85b78a09f3b988"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" DROP CONSTRAINT "FK_0426779bd58d26cbe832c9af800"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_run"`);
    await queryRunner.query(`DROP TYPE "public"."experiment_run_status_enum"`);
    await queryRunner.query(`DROP TABLE "experiment"`);
    await queryRunner.query(`DROP TYPE "public"."experiment_status_enum"`);
  }
}
