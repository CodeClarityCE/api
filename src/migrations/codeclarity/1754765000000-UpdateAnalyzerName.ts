import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateAnalyzerName1754765000000 implements MigrationInterface {
  name = "UpdateAnalyzerName1754765000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update analyzer name from "JavaScript Analyzer" to "Multi-Language Analyzer"
    // since it now supports both JavaScript and PHP
    await queryRunner.query(`
            UPDATE "analyzer" 
            SET "name" = 'Multi-Language Analyzer',
                "description" = 'Analyzes JavaScript and PHP projects for dependencies, vulnerabilities, and license compliance'
            WHERE "name" = 'JavaScript Analyzer'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to original name
    await queryRunner.query(`
            UPDATE "analyzer" 
            SET "name" = 'JavaScript Analyzer',
                "description" = 'Analyzes JavaScript projects for dependencies, vulnerabilities, and license compliance'
            WHERE "name" = 'Multi-Language Analyzer'
        `);
  }
}
