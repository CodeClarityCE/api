import { MigrationInterface, QueryRunner } from "typeorm";

// FriendsOfPHP gives no modified date, and an advisory with no branch time has no published date.
export class AllowMissingFriendsOfPhpDates1794614400000 implements MigrationInterface {
  name = "AllowMissingFriendsOfPhpDates1794614400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "friends_of_php" ALTER COLUMN "published" DROP NOT NULL, ALTER COLUMN "modified" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "friends_of_php" ALTER COLUMN "published" SET NOT NULL, ALTER COLUMN "modified" SET NOT NULL`,
    );
  }
}
