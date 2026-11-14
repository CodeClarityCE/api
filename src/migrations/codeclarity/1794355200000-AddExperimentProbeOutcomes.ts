import { MigrationInterface, QueryRunner } from "typeorm";

// Probe outcome rows (experiments v2): the packages each dataset entry
// resolves at each analysed commit, and the affected versions of each copied
// instance so versions only a fix probe sees can be tested later.
// Constraint names are the ones TypeORM's default naming strategy derives.
export class AddExperimentProbeOutcomes1794355200000 implements MigrationInterface {
  name = "AddExperimentProbeOutcomes1794355200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "experiment_probe_outcome" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "commit_hash" character varying(64) NOT NULL, "committed_at" TIMESTAMP WITH TIME ZONE, "packages" jsonb NOT NULL, "experimentId" uuid NOT NULL, "datasetEntryId" uuid NOT NULL, CONSTRAINT "UQ_d408691b22bc59012cbdb6754c6" UNIQUE ("experimentId", "datasetEntryId", "commit_hash"), CONSTRAINT "PK_32b962ef3820d2ef760457280e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d361b913f3634aaa62690a593c" ON "experiment_probe_outcome" ("experimentId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD "vulnerable_versions" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_outcome" ADD CONSTRAINT "FK_d361b913f3634aaa62690a593ca" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_outcome" ADD CONSTRAINT "FK_02c5903d96db84c98250172d7b1" FOREIGN KEY ("datasetEntryId") REFERENCES "dataset_entry"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_outcome" DROP CONSTRAINT "FK_02c5903d96db84c98250172d7b1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_outcome" DROP CONSTRAINT "FK_d361b913f3634aaa62690a593ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" DROP COLUMN "vulnerable_versions"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_probe_outcome"`);
  }
}
