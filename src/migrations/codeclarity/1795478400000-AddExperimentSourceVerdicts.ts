import { MigrationInterface, QueryRunner } from "typeorm";

// Source verdict and status columns on copied experiment instances (ADR 0013).
// Rows copied before this stay null.
export class AddExperimentSourceVerdicts1795478400000 implements MigrationInterface {
  name = "AddExperimentSourceVerdicts1795478400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD "osv_verdict" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD "nvd_verdict" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD "gcve_verdict" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD "instance_status" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD "uncorroborated" boolean`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_vulnerability_instance" ADD "disputed" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      "disputed",
      "uncorroborated",
      "instance_status",
      "gcve_verdict",
      "nvd_verdict",
      "osv_verdict",
    ]) {
      await queryRunner.query(
        `ALTER TABLE "experiment_vulnerability_instance" DROP COLUMN "${column}"`,
      );
    }
  }
}
