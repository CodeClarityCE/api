import { MigrationInterface, QueryRunner } from "typeorm";

const OCCURRENCE_COLUMNS = [
  `"vulnerability_id" character varying(100) NOT NULL`,
  `"analysis_vulnerability_id" character varying(100) NOT NULL`,
  `"package" character varying(200) NOT NULL`,
  `"ecosystem" character varying(50)`,
  `"installed_version" character varying(100) NOT NULL`,
  `"prod" boolean NOT NULL`,
  `"severity_class" character varying(20) NOT NULL`,
  `"severity_score" double precision`,
  `"fixed_version" character varying(100)`,
  `"top_level_dependencies" jsonb NOT NULL DEFAULT '[]'`,
];

const TICKET_COLUMNS = [
  `"remediation_kind" character varying(30)`,
  `"remediation_workspace" character varying(200)`,
  `"remediation_package" character varying(200)`,
  `"potentially_breaking" boolean`,
  `"package_manager" character varying(20)`,
  `"remediation_command" text`,
  `"remediation_manifest_edit" jsonb`,
];

const columnName = (column: string): string => column.split(" ")[0]!;

// A ticket tracks one remediation and lists the vulnerability instances it resolves (ADR 0016).
// Existing tickets keep their one vulnerability and get no remediation.
export class AddRemediationTickets1796040000000 implements MigrationInterface {
  name = "AddRemediationTickets1796040000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // No release wrote occurrences, so the table is empty and its new columns can be NOT NULL.
    await queryRunner.query(`DELETE FROM "ticket_vulnerability_occurrence"`);
    await queryRunner.query(
      `ALTER TABLE "ticket_vulnerability_occurrence" DROP COLUMN "affected_paths"`,
    );
    for (const column of OCCURRENCE_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "ticket_vulnerability_occurrence" ADD ${column}`,
      );
    }
    for (const column of TICKET_COLUMNS) {
      await queryRunner.query(`ALTER TABLE "ticket" ADD ${column}`);
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed2066292bd3c0f5066751c364" ON "ticket_vulnerability_occurrence" ("ticketId", "analysisId", "workspace", "vulnerability_id", "package", "installed_version")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd955f0e52609f6d216c7071cb" ON "ticket" ("projectId", "remediation_kind", "remediation_workspace", "remediation_package")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dd955f0e52609f6d216c7071cb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ed2066292bd3c0f5066751c364"`,
    );
    for (const column of [...TICKET_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "ticket" DROP COLUMN ${columnName(column)}`,
      );
    }
    // The earlier schema cannot hold these rows.
    await queryRunner.query(`DELETE FROM "ticket_vulnerability_occurrence"`);
    for (const column of [...OCCURRENCE_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "ticket_vulnerability_occurrence" DROP COLUMN ${columnName(column)}`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "ticket_vulnerability_occurrence" ADD "affected_paths" jsonb NOT NULL`,
    );
  }
}
