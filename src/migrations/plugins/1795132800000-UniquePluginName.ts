import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One registry row per plugin name. Merges the duplicates that replicas
 * starting together inserted, then lets plugins register with an upsert.
 */
export class UniquePluginName1795132800000 implements MigrationInterface {
  name = "UniquePluginName1795132800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep the row with the highest version, comparing its numbers in order.
    await queryRunner.query(`
      DELETE FROM "plugin" p
      USING (
        SELECT "id", row_number() OVER (
          PARTITION BY "name"
          ORDER BY (
            SELECT array_agg(m[1]::numeric ORDER BY n)
            FROM regexp_matches(coalesce("version", ''), '\\d+', 'g')
              WITH ORDINALITY AS t(m, n)
          ) DESC NULLS LAST, "id"
        ) AS rank
        FROM "plugin"
        WHERE "name" IS NOT NULL
      ) ranked
      WHERE p."id" = ranked."id" AND ranked.rank > 1
    `);
    await queryRunner.query(
      `ALTER TABLE "plugin" ADD CONSTRAINT "UQ_plugin_name" UNIQUE ("name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plugin" DROP CONSTRAINT "UQ_plugin_name"`,
    );
  }
}
