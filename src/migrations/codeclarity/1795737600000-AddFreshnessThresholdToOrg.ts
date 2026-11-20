import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFreshnessThresholdToOrg1795737600000 implements MigrationInterface {
  name = "AddFreshnessThresholdToOrg1795737600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization" ADD "freshness_threshold_days" integer NOT NULL DEFAULT 14`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization" DROP COLUMN "freshness_threshold_days"`,
    );
  }
}
