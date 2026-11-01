import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOsvLastToConfig1785829532189 implements MigrationInterface {
  name = "AddOsvLastToConfig1785829532189";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "config" ADD COLUMN IF NOT EXISTS "osv_last" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "config" DROP COLUMN IF EXISTS "osv_last"`,
    );
  }
}
