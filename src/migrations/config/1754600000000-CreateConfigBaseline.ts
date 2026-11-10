import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateConfigBaseline1754600000000 implements MigrationInterface {
  name = "CreateConfigBaseline1754600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Same table as the 2025-05-27 config dump; later migrations add the other *_last columns.
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "config" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "nvd_last" timestamp with time zone,
        "npm_last" character varying,
        CONSTRAINT "config_pkey" PRIMARY KEY ("id")
      )
    `);
    // The services expect exactly one row; null watermarks make the first update a full fetch.
    await queryRunner.query(
      `INSERT INTO "config" ("id") SELECT uuid_generate_v4() WHERE NOT EXISTS (SELECT 1 FROM "config")`,
    );
  }

  // These tables may have come from a dump with live data, so reverting leaves them in place.
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Nothing to undo safely.
  }
}
