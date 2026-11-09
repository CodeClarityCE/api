import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKnowledgeValidation1794355200000 implements MigrationInterface {
  name = "AddKnowledgeValidation1794355200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_source_sync"
        ADD COLUMN "validated_row_count" bigint,
        ADD COLUMN "validated_malicious_count" bigint,
        ADD COLUMN "validated_at" timestamptz,
        ADD COLUMN "validation_error" text
    `);
    // A dated restore can create this table before the migration runs, so keep its marker.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "knowledge_dated_restore" (
        "id" boolean PRIMARY KEY DEFAULT true CHECK ("id"),
        "label" character varying NOT NULL,
        "marked_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_dated_restore"`);
    await queryRunner.query(`
      ALTER TABLE "knowledge_source_sync"
        DROP COLUMN "validation_error",
        DROP COLUMN "validated_at",
        DROP COLUMN "validated_malicious_count",
        DROP COLUMN "validated_row_count"
    `);
  }
}
