import { MigrationInterface, QueryRunner } from "typeorm";

// Links a Figure to a Published results version and stores what it plots.
// Constraint names are the ones TypeORM's default naming strategy derives.
export class TieExperimentFiguresToPublishedResults1794960000000 implements MigrationInterface {
  name = "TieExperimentFiguresToPublishedResults1794960000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "experiment_published_figure_data" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "definition_key" text NOT NULL, "data" jsonb NOT NULL, "publishedResultsId" uuid NOT NULL, CONSTRAINT "UQ_a6afa754fd4717be9fb59d2b64d" UNIQUE ("publishedResultsId", "definition_key"), CONSTRAINT "PK_90ffc3cf8836b429b7dd6f005d0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_published_figure_data" ADD CONSTRAINT "FK_2605df273fbcd5e7572b940081f" FOREIGN KEY ("publishedResultsId") REFERENCES "experiment_published_results"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_figure" ADD "publishedResultsId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_figure" ADD CONSTRAINT "FK_b41d8b7bb2f10588e171e56caba" FOREIGN KEY ("publishedResultsId") REFERENCES "experiment_published_results"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_figure" DROP CONSTRAINT "FK_b41d8b7bb2f10588e171e56caba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_figure" DROP COLUMN "publishedResultsId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_published_figure_data" DROP CONSTRAINT "FK_2605df273fbcd5e7572b940081f"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_published_figure_data"`);
  }
}
