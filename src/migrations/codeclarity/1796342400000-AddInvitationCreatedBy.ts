import { MigrationInterface, QueryRunner } from "typeorm";

// Records who sent each invitation, so the invitations list can name them.
export class AddInvitationCreatedBy1796342400000 implements MigrationInterface {
  name = "AddInvitationCreatedBy1796342400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invitation" ADD "createdById" uuid`);
    await queryRunner.query(
      `ALTER TABLE "invitation" ADD CONSTRAINT "FK_765ded79aea72509a235e9d33a1" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invitation" DROP CONSTRAINT "FK_765ded79aea72509a235e9d33a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitation" DROP COLUMN "createdById"`,
    );
  }
}
