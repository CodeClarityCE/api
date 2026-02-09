import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGcveLastToConfig1770200000000 implements MigrationInterface {
  name = "AddGcveLastToConfig1770200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'config' AND column_name = 'gcve_last'
    `);
    if (hasColumn.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "config" ADD COLUMN "gcve_last" timestamptz`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "config" DROP COLUMN IF EXISTS "gcve_last"`,
    );
  }
}
