import { MigrationInterface, QueryRunner } from "typeorm";

// Results of an experiment frozen per metric version (ADR 0007).
// Constraint names are the ones TypeORM's default naming strategy derives.
export class AddExperimentPublishedResults1794873600000 implements MigrationInterface {
  name = "AddExperimentPublishedResults1794873600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "experiment_published_results" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "metric_version" integer NOT NULL, "results" jsonb NOT NULL, "package_checksum" character varying(64), "published_on" TIMESTAMP WITH TIME ZONE NOT NULL, "experimentId" uuid NOT NULL, "publishedById" uuid, CONSTRAINT "UQ_ae784ab09a7110ff7e4e564ade6" UNIQUE ("experimentId", "metric_version"), CONSTRAINT "PK_424cebfad68dc318d0869ba3ee0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_published_results" ADD CONSTRAINT "FK_86a74b339afa4f28e511732fd96" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_published_results" ADD CONSTRAINT "FK_d7dac726885562d0a53674a87d7" FOREIGN KEY ("publishedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_published_results" DROP CONSTRAINT "FK_d7dac726885562d0a53674a87d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_published_results" DROP CONSTRAINT "FK_86a74b339afa4f28e511732fd96"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_published_results"`);
  }
}
