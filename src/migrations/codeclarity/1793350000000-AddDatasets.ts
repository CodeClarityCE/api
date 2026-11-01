import { MigrationInterface, QueryRunner } from "typeorm";

// Named, immutable datasets of the most-starred GitHub repositories, built in
// the background by the API (codeclarity_modules/datasets). Constraint names
// are the ones TypeORM's default naming strategy derives, so a later
// migration:generate sees no drift.
export class AddDatasets1793350000000 implements MigrationInterface {
  name = "AddDatasets1793350000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."dataset_status_enum" AS ENUM('BUILDING', 'READY', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dataset" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "status" "public"."dataset_status_enum" NOT NULL DEFAULT 'BUILDING', "params" jsonb NOT NULL, "stats" jsonb, "error" character varying(1000), "lease_owner" character varying(200), "lease_until" TIMESTAMP WITH TIME ZONE, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "built_on" TIMESTAMP WITH TIME ZONE, "organizationId" uuid, "createdById" uuid, "integrationId" uuid, CONSTRAINT "UQ_41b08d9cb8d1dd59bf34bbdbd42" UNIQUE ("organizationId", "name"), CONSTRAINT "PK_36c1c67adb3d1dd69ae57f18913" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "dataset_entry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rank" integer NOT NULL, "full_name" character varying(200) NOT NULL, "owner" character varying(100) NOT NULL, "repo" character varying(100) NOT NULL, "git_url" character varying(300) NOT NULL, "default_branch" character varying(255) NOT NULL, "stars" integer NOT NULL, "language" character varying(50), "github_id" bigint, "lockfiles" jsonb NOT NULL, "datasetId" uuid, CONSTRAINT "UQ_82ca9da0dd431a332f29be50eb0" UNIQUE ("datasetId", "rank"), CONSTRAINT "PK_2e05127b0519fbbf13ff8282221" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset" ADD CONSTRAINT "FK_d86a15d9822f2835a58eb1d6cd3" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset" ADD CONSTRAINT "FK_ff6c53fcff0cf4d696555f39ee0" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset" ADD CONSTRAINT "FK_bab3ebec28870fa289d09ab511a" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_entry" ADD CONSTRAINT "FK_9274d0e0cdbae3a3a7d7479fa9a" FOREIGN KEY ("datasetId") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dataset_entry" DROP CONSTRAINT "FK_9274d0e0cdbae3a3a7d7479fa9a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset" DROP CONSTRAINT "FK_bab3ebec28870fa289d09ab511a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset" DROP CONSTRAINT "FK_ff6c53fcff0cf4d696555f39ee0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset" DROP CONSTRAINT "FK_d86a15d9822f2835a58eb1d6cd3"`,
    );
    await queryRunner.query(`DROP TABLE "dataset_entry"`);
    await queryRunner.query(`DROP TABLE "dataset"`);
    await queryRunner.query(`DROP TYPE "public"."dataset_status_enum"`);
  }
}
