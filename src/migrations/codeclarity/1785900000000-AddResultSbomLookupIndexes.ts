import { MigrationInterface, QueryRunner } from "typeorm";

export class AddResultSbomLookupIndexes1785900000000 implements MigrationInterface {
  name = "AddResultSbomLookupIndexes1785900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Speed up the package-update-notification SBOM lookup in
    // backend/services/knowledge/src/utilities/pgsql/package.go, which
    // filters `result` by plugin and does a jsonb containment check on
    // result->'workspaces' once per updated package during knowledge-update.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_result_plugin" ON "result" ("plugin")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_result_workspaces_gin" ON "result" USING gin (("result" -> 'workspaces') jsonb_path_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_result_workspaces_gin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_result_plugin"`);
  }
}
