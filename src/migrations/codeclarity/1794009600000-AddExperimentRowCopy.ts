import { MigrationInterface, QueryRunner } from "typeorm";

// The tidy rows an experiment copies from each done run (ADR 0001): one
// summary row per run and one row per vulnerability instance. Both belong to
// the experiment and cascade on experiment and on run delete. Constraint
// names are the ones TypeORM's default naming strategy derives, so a later
// migration:generate sees no drift.
export class AddExperimentRowCopy1794009600000 implements MigrationInterface {
  name = "AddExperimentRowCopy1794009600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "experiment_run_summary_row" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "total_dependencies" integer NOT NULL, "direct_dependencies" integer NOT NULL, "transitive_dependencies" integer NOT NULL, "dev_dependencies" integer NOT NULL, "prod_dependencies" integer NOT NULL, "package_manager" character varying(32), "total_vulnerabilities" integer NOT NULL, "vulnerable_dependencies" integer NOT NULL, "direct_vulnerabilities" integer NOT NULL, "transitive_vulnerabilities" integer NOT NULL, "n_critical" integer NOT NULL, "n_high" integer NOT NULL, "n_medium" integer NOT NULL, "n_low" integer NOT NULL, "n_none" integer NOT NULL, "experimentId" uuid NOT NULL, "runId" uuid NOT NULL, CONSTRAINT "REL_cedf382889a40c11e4665b70a3" UNIQUE ("runId"), CONSTRAINT "PK_abb2c33281b852a1c153acbfd34" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c01066e8c4c2ad01bbd8f651e" ON "experiment_run_summary_row" ("experimentId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "experiment_vulnerability_instance" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspace" character varying NOT NULL, "vulnerability_id" character varying, "affected_dependency" character varying, "affected_version" character varying, "severity_class" character varying, "severity_score" double precision, "severity_vector" character varying, "impact" double precision, "exploitability" double precision, "epss_score" double precision, "epss_percentile" double precision, "conflict_flag" character varying, "winning_source" character varying, "direct_dependency" boolean NOT NULL, "published_date" character varying, "modified_date" character varying, "withdrawn_date" character varying, "experimentId" uuid NOT NULL, "runId" uuid NOT NULL, CONSTRAINT "PK_ec11d08b9423e5f0e6e4d5f84b2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e1a40f5e8fe516557f0a12f350" ON "experiment_vulnerability_instance" ("experimentId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c6751eef99cc4024650c7385b7" ON "experiment_vulnerability_instance" ("runId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run_summary_row" ADD CONSTRAINT "FK_0c01066e8c4c2ad01bbd8f651ea" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run_summary_row" ADD CONSTRAINT "FK_cedf382889a40c11e4665b70a3d" FOREIGN KEY ("runId") REFERENCES "experiment_run"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD CONSTRAINT "FK_e1a40f5e8fe516557f0a12f350a" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD CONSTRAINT "FK_c6751eef99cc4024650c7385b73" FOREIGN KEY ("runId") REFERENCES "experiment_run"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" DROP CONSTRAINT "FK_c6751eef99cc4024650c7385b73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" DROP CONSTRAINT "FK_e1a40f5e8fe516557f0a12f350a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run_summary_row" DROP CONSTRAINT "FK_cedf382889a40c11e4665b70a3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_run_summary_row" DROP CONSTRAINT "FK_0c01066e8c4c2ad01bbd8f651ea"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c6751eef99cc4024650c7385b7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e1a40f5e8fe516557f0a12f350"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_vulnerability_instance"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0c01066e8c4c2ad01bbd8f651e"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_run_summary_row"`);
  }
}
