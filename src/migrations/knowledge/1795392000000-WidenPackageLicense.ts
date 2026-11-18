import { MigrationInterface, QueryRunner } from "typeorm";

// A package license is an SPDX expression of any length, such as a long Composer OR list.
export class WidenPackageLicense1795392000000 implements MigrationInterface {
  name = "WidenPackageLicense1795392000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "package" ALTER COLUMN "license" TYPE text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cuts longer expressions so the old length fits.
    await queryRunner.query(
      `ALTER TABLE "package" ALTER COLUMN "license" TYPE character varying(50) USING left("license", 50)`,
    );
  }
}
