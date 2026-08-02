import { MigrationInterface, QueryRunner } from "typeorm";

// Backend services (currently the downloader) persist why an analysis was
// marked failed, so clients polling an analysis can distinguish e.g. an
// unresolvable commit from a crashed plugin. Writers truncate to 500 chars.
export class AddAnalysisFailureReason1765300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "analysis" ADD COLUMN IF NOT EXISTS "failure_reason" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "analysis" DROP COLUMN IF EXISTS "failure_reason"`,
    );
  }
}
