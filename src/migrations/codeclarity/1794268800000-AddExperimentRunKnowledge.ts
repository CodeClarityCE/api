import { MigrationInterface, QueryRunner } from "typeorm";

// The knowledge provenance each experiment run was matched against.
// Nullable: earlier runs and runs that matched nothing have none.
export class AddExperimentRunKnowledge1794268800000 implements MigrationInterface {
  name = "AddExperimentRunKnowledge1794268800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD "knowledge" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP COLUMN "knowledge"`,
    );
  }
}
