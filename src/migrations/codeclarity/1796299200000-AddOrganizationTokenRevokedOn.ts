import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrganizationTokenRevokedOn1796299200000 implements MigrationInterface {
  name = "AddOrganizationTokenRevokedOn1796299200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization_token" ADD "revoked_on" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revoked tokens must stay unusable, so they go with the column.
    await queryRunner.query(
      `DELETE FROM "organization_token" WHERE "revoked_on" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_token" DROP COLUMN "revoked_on"`,
    );
  }
}
