import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1754657566461 implements MigrationInterface {
  name = "Init1754657566461";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_users_user" ("notificationId" uuid NOT NULL, "userId" uuid NOT NULL, CONSTRAINT "PK_7606b7d7b70299cea4521b61989" PRIMARY KEY ("notificationId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cc471803e22568445b772a45ea" ON "notification_users_user" ("notificationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9c0c1c8c13cf53180e087e7f36" ON "notification_users_user" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_users_user" ADD CONSTRAINT "FK_cc471803e22568445b772a45ea0" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_users_user" ADD CONSTRAINT "FK_9c0c1c8c13cf53180e087e7f364" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_users_user" DROP CONSTRAINT "FK_9c0c1c8c13cf53180e087e7f364"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_users_user" DROP CONSTRAINT "FK_cc471803e22568445b772a45ea0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9c0c1c8c13cf53180e087e7f36"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cc471803e22568445b772a45ea"`,
    );
    await queryRunner.query(`DROP TABLE "notification_users_user"`);
  }
}
