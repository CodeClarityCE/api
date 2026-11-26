import { MigrationInterface, QueryRunner } from "typeorm";

// Server-side refresh tokens, stored as hashes, so sign-ins can rotate and be revoked.
export class AddRefreshTokens1796428800000 implements MigrationInterface {
  name = "AddRefreshTokens1796428800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_token" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token_hash" character(64) NOT NULL, "family_id" uuid NOT NULL, "userId" uuid NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_on" TIMESTAMP WITH TIME ZONE NOT NULL, "used_on" TIMESTAMP WITH TIME ZONE, "revoked_on" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_f0812282fad2e352cdaf83ef0a9" UNIQUE ("token_hash"), CONSTRAINT "PK_b575dd3c21fb0831013c909e7fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb31f2a7917404a46e17f539f1" ON "refresh_token" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8e913e288156c133999341156a" ON "refresh_token" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_8e913e288156c133999341156ad" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_token"`);
  }
}
