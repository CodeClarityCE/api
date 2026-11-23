import { MigrationInterface, QueryRunner } from "typeorm";

/** Drops js-patching from every analyzer's steps and language config, as the plugin is gone. */
export class RemoveJsPatchingFromAnalyzers1796256000000 implements MigrationInterface {
  name = "RemoveJsPatchingFromAnalyzers1796256000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep each stage without its js-patching steps, and drop stages left empty.
    await queryRunner.query(`
      UPDATE "analyzer" a
      SET "steps" = (
        SELECT coalesce(jsonb_agg(kept ORDER BY stage_index), '[]'::jsonb)
        FROM (
          SELECT stage_index, (
            SELECT coalesce(jsonb_agg(s ORDER BY step_index), '[]'::jsonb)
            FROM jsonb_array_elements(stage) WITH ORDINALITY AS t(s, step_index)
            WHERE s->>'name' IS DISTINCT FROM 'js-patching'
          ) AS kept
          FROM jsonb_array_elements(a."steps") WITH ORDINALITY AS st(stage, stage_index)
          WHERE jsonb_typeof(stage) = 'array'
        ) stages
        WHERE jsonb_array_length(kept) > 0
      )
      WHERE jsonb_typeof(a."steps") = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(a."steps") stage, jsonb_array_elements(stage) s
          WHERE jsonb_typeof(stage) = 'array' AND s->>'name' = 'js-patching'
        )
    `);
    // Remove it from each language's plugin list.
    await queryRunner.query(`
      UPDATE "analyzer" a
      SET "language_config" = (
        SELECT jsonb_object_agg(
          lang,
          CASE WHEN jsonb_typeof(cfg->'plugins') = 'array'
            THEN jsonb_set(cfg, '{plugins}', (cfg->'plugins') - 'js-patching')
            ELSE cfg END
        )
        FROM jsonb_each(a."language_config") AS l(lang, cfg)
      )
      WHERE jsonb_typeof(a."language_config") = 'object'
        AND a."language_config"::text LIKE '%js-patching%'
    `);
  }

  public async down(): Promise<void> {
    // The removed steps are not restored: the plugin no longer exists.
  }
}
