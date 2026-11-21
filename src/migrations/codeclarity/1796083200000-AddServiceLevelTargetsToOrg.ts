import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceLevelTargetsToOrg1796083200000 implements MigrationInterface {
  name = "AddServiceLevelTargetsToOrg1796083200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization" ADD "service_level_targets_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization" ADD "service_level_targets" jsonb NOT NULL DEFAULT '{"low": null, "high": 30, "medium": 90, "critical": 7}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization" DROP COLUMN "service_level_targets"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization" DROP COLUMN "service_level_targets_enabled"`,
    );
  }
}
