import { MigrationInterface, QueryRunner } from "typeorm";

// Snapshot grids (experiments v2): an experiment's grid interval and count,
// and one run per (experiment, dataset entry, grid index) instead of per
// entry. Only column defaults: existing (v1) experiments read as HEAD-only
// grids (count 0) whose runs are all HEAD (index 0, no grid date).
// Constraint names are the ones TypeORM's default naming strategy derives,
// so a later migration:generate sees no drift.
export class AddExperimentSnapshotGrid1794096000000 implements MigrationInterface {
  name = "AddExperimentSnapshotGrid1794096000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP CONSTRAINT "UQ_078a47b01b585a7fa86b09c5285"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."experiment_grid_interval_enum" AS ENUM('day', 'week', 'month')`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" ADD "grid_interval" "public"."experiment_grid_interval_enum" NOT NULL DEFAULT 'month'`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" ADD "grid_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD "grid_index" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD "grid_date" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD "sharedFromId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD CONSTRAINT "UQ_fac8ee0521a2242f6c2e9b988e2" UNIQUE ("experimentId", "datasetEntryId", "grid_index")`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_1fa5e4fbbc359d3b1283d558304" FOREIGN KEY ("sharedFromId") REFERENCES "experiment_run"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP CONSTRAINT "FK_1fa5e4fbbc359d3b1283d558304"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP CONSTRAINT "UQ_fac8ee0521a2242f6c2e9b988e2"`,
    );
    // Only HEAD runs fit the per-entry key: grid snapshot runs are dropped
    await queryRunner.query(
      `DELETE FROM "experiment_run" WHERE "grid_date" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP COLUMN "sharedFromId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP COLUMN "grid_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" DROP COLUMN "grid_index"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" DROP COLUMN "grid_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment" DROP COLUMN "grid_interval"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."experiment_grid_interval_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run" ADD CONSTRAINT "UQ_078a47b01b585a7fa86b09c5285" UNIQUE ("experimentId", "datasetEntryId")`,
    );
  }
}
