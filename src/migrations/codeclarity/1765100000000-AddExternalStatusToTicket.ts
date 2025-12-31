import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExternalStatusToTicket1765100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add external_status column to ticket table
    await queryRunner.query(
      `ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "external_status" character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ticket" DROP COLUMN IF EXISTS "external_status"`,
    );
  }
}
