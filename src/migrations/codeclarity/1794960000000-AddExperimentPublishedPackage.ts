import { MigrationInterface, QueryRunner } from "typeorm";

// The replication package frozen with each Published results version.
export class AddExperimentPublishedPackage1794960000000 implements MigrationInterface {
  name = "AddExperimentPublishedPackage1794960000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_published_results" ADD "package_archive" bytea`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_published_results" DROP COLUMN "package_archive"`,
    );
  }
}
