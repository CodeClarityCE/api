import { MigrationInterface, QueryRunner } from "typeorm";

// Deleting a project deletes its tickets. Deleting an analysis keeps its
// tickets, clears their source analysis and deletes its occurrences.
export class TicketDeleteRules1795305600000 implements MigrationInterface {
  name = "TicketDeleteRules1795305600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.setRules(queryRunner, {
      project: "CASCADE",
      sourceAnalysis: "SET NULL",
      occurrenceAnalysis: "CASCADE",
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.setRules(queryRunner, {
      project: "NO ACTION",
      sourceAnalysis: "NO ACTION",
      occurrenceAnalysis: "NO ACTION",
    });
  }

  private async setRules(
    queryRunner: QueryRunner,
    rules: {
      project: string;
      sourceAnalysis: string;
      occurrenceAnalysis: string;
    },
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ticket" DROP CONSTRAINT "FK_c6f47d3e270123ccd2f16f13d29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket" ADD CONSTRAINT "FK_c6f47d3e270123ccd2f16f13d29" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE ${rules.project} ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket" DROP CONSTRAINT "FK_c8e3489ee961642f35cdf610564"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket" ADD CONSTRAINT "FK_c8e3489ee961642f35cdf610564" FOREIGN KEY ("sourceAnalysisId") REFERENCES "analysis"("id") ON DELETE ${rules.sourceAnalysis} ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_vulnerability_occurrence" DROP CONSTRAINT "FK_347267f6bd37be65ee3388a82e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_vulnerability_occurrence" ADD CONSTRAINT "FK_347267f6bd37be65ee3388a82e4" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE ${rules.occurrenceAnalysis} ON UPDATE NO ACTION`,
    );
  }
}
