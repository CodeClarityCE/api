import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrganizationTokens1796212800000 implements MigrationInterface {
  name = "AddOrganizationTokens1796212800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "organization_token" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "scope" character varying(20) NOT NULL, "secret_hash" character(64) NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_on" TIMESTAMP WITH TIME ZONE NOT NULL, "organizationId" uuid NOT NULL, "createdById" uuid, CONSTRAINT "UQ_6c0dbee45b0d267d714a14d40bb" UNIQUE ("secret_hash"), CONSTRAINT "PK_1f3a6b88bbbc6455ef67131f795" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_token" ADD CONSTRAINT "FK_8eb4967136eb978cfda1a5600ef" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_token" ADD CONSTRAINT "FK_c21b5129e6a8f2100ca6ea23b76" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "log" ADD "blame_on_token_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "log" ADD "blame_on_token_name" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "log" ALTER COLUMN "blame_on_email" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Entries made by a token keep its name where the email was.
    await queryRunner.query(
      `UPDATE "log" SET "blame_on_email" = LEFT('Organization token ' || COALESCE("blame_on_token_name", ''), 100) WHERE "blame_on_email" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "log" ALTER COLUMN "blame_on_email" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "log" DROP COLUMN "blame_on_token_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "log" DROP COLUMN "blame_on_token_id"`,
    );
    await queryRunner.query(`DROP TABLE "organization_token"`);
  }
}
