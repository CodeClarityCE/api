import { MigrationInterface, QueryRunner } from "typeorm";

// The lowercase step keys the API used to write, and the spelling the dispatcher writes.
const RENAMES: Record<string, string> = {
  name: "Name",
  version: "Version",
  status: "Status",
  result: "Result",
  config: "Config",
  started_on: "Started_on",
  ended_on: "Ended_on",
};

// Rewrites lowercase analysis step keys to the capitalized ones; values are kept.
export class CapitalizeAnalysisStepKeys1795392000000 implements MigrationInterface {
  name = "CapitalizeAnalysisStepKeys1795392000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const lowercase = Object.keys(RENAMES);
    const renamed = `CASE e.key ${Object.entries(RENAMES)
      .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
      .join(" ")} ELSE e.key END`;
    // Lowercase keys sort first, so a capitalized twin's value wins.
    const step = `COALESCE((
      SELECT jsonb_object_agg(${renamed}, e.value ORDER BY NOT (e.key = ANY($1)))
      FROM jsonb_each(step.value) e), '{}'::jsonb)`;
    await queryRunner.query(
      `UPDATE "analysis" a SET "steps" = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN jsonb_typeof(stg.value) = 'array' THEN (
            SELECT COALESCE(jsonb_agg(
              CASE WHEN jsonb_typeof(step.value) = 'object' THEN ${step} ELSE step.value END
              ORDER BY step.ordinality), '[]'::jsonb)
            FROM jsonb_array_elements(stg.value) WITH ORDINALITY step
          ) ELSE stg.value END
          ORDER BY stg.ordinality), '[]'::jsonb)
        FROM jsonb_array_elements(a."steps") WITH ORDINALITY stg
      )
      WHERE jsonb_typeof(a."steps") = 'array' AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(a."steps") stg,
          jsonb_array_elements(CASE WHEN jsonb_typeof(stg.value) = 'array' THEN stg.value ELSE '[]'::jsonb END) step
        WHERE jsonb_typeof(step.value) = 'object'
          AND step.value ?| $1
      )`,
      [lowercase],
    );
  }

  public async down(): Promise<void> {
    // Nothing to undo: every reader accepts the capitalized keys.
  }
}
