import { MigrationInterface, QueryRunner } from "typeorm";

// How many records upstream offered at each source's last successful update.
export class AddKnowledgeSourceUpstreamTotal1794528000000 implements MigrationInterface {
  name = "AddKnowledgeSourceUpstreamTotal1794528000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_source_sync" ADD COLUMN "upstream_total" bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_source_sync" DROP COLUMN "upstream_total"`,
    );
  }
}
