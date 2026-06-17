import { MigrationInterface, QueryRunner } from "typeorm";

// The analysis.commit_hash column was varchar(25), but a git commit SHA is 40
// chars (64 for SHA-256). Inserting a real SHA overflowed the column, so every
// historical-commit analysis failed with a 500. Widen it to varchar(64).
export class AlterAnalysisCommitHashLength1765200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "analysis" ALTER COLUMN "commit_hash" TYPE character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "analysis" ALTER COLUMN "commit_hash" TYPE character varying(25)`,
    );
  }
}
