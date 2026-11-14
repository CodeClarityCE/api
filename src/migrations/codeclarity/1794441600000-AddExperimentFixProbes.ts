import { MigrationInterface, QueryRunner } from "typeorm";

// Fix probes (experiments v2, ADR 0005): one row per SBOM-only probe analysis,
// and the lockfile-touching commits listed between two snapshot commits.
// Constraint names are the ones TypeORM's default naming strategy derives.
export class AddExperimentFixProbes1794441600000 implements MigrationInterface {
  name = "AddExperimentFixProbes1794441600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "experiment_probe_interval" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "from_commit" character varying(64) NOT NULL, "to_commit" character varying(64) NOT NULL, "lockfile_path" text, "candidates" jsonb NOT NULL, "error" character varying(1000), "experimentId" uuid NOT NULL, "datasetEntryId" uuid NOT NULL, CONSTRAINT "UQ_12809f51d1e3e8aa83b9eb2dfda" UNIQUE ("experimentId", "datasetEntryId", "from_commit", "to_commit"), CONSTRAINT "PK_49f80dd931f59f29823bad3598a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_96f78ddec0eb78003fb1fc57d1" ON "experiment_probe_interval" ("experimentId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "experiment_probe" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "commit_hash" character varying(64) NOT NULL, "committed_at" TIMESTAMP WITH TIME ZONE, "status" character varying(16) NOT NULL DEFAULT 'pending', "error" character varying(1000), "submitted_on" TIMESTAMP WITH TIME ZONE, "ended_on" TIMESTAMP WITH TIME ZONE, "experimentId" uuid NOT NULL, "datasetEntryId" uuid NOT NULL, "analysisId" uuid, CONSTRAINT "UQ_38b5e1ac63628126a60cdb2358f" UNIQUE ("experimentId", "datasetEntryId", "commit_hash"), CONSTRAINT "PK_bd76902864739951b4c7bc01c8a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_146341d79551533eb39f99b6bb" ON "experiment_probe" ("experimentId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_interval" ADD CONSTRAINT "FK_96f78ddec0eb78003fb1fc57d19" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_interval" ADD CONSTRAINT "FK_e3b2b0f4daac018cc1220348b5a" FOREIGN KEY ("datasetEntryId") REFERENCES "dataset_entry"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe" ADD CONSTRAINT "FK_146341d79551533eb39f99b6bb2" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe" ADD CONSTRAINT "FK_36b5a180e9d6f6948a5af77fa50" FOREIGN KEY ("datasetEntryId") REFERENCES "dataset_entry"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe" ADD CONSTRAINT "FK_db739707d3bcb018df2eb819072" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_probe" DROP CONSTRAINT "FK_db739707d3bcb018df2eb819072"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe" DROP CONSTRAINT "FK_36b5a180e9d6f6948a5af77fa50"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe" DROP CONSTRAINT "FK_146341d79551533eb39f99b6bb2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_interval" DROP CONSTRAINT "FK_e3b2b0f4daac018cc1220348b5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_probe_interval" DROP CONSTRAINT "FK_96f78ddec0eb78003fb1fc57d19"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_probe"`);
    await queryRunner.query(`DROP TABLE "experiment_probe_interval"`);
  }
}
