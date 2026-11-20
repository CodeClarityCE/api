import { MigrationInterface, QueryRunner } from "typeorm";

// The KEV source watermark; null until its first sync.
export class AddKevLastToConfig1795651200000 implements MigrationInterface {
  name = "AddKevLastToConfig1795651200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "config" ADD COLUMN IF NOT EXISTS "kev_last" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "config" DROP COLUMN IF EXISTS "kev_last"`,
    );
  }
}
