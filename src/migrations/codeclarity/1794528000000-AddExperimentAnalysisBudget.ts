import { MigrationInterface, QueryRunner } from "typeorm";

// An optional cap on the analyses an experiment submits.
// Nullable: earlier experiments have no budget.
export class AddExperimentAnalysisBudget1794528000000 implements MigrationInterface {
  name = "AddExperimentAnalysisBudget1794528000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment" ADD "analysis_budget" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment" DROP COLUMN "analysis_budget"`,
    );
  }
}
