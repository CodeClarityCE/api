import { MigrationInterface, QueryRunner } from "typeorm";

// Tells the seeded analyzer which plugins run per language, so a JavaScript
// project no longer runs php-sbom and fails.
export class SetMultiLanguageAnalyzerLanguages1794614400000 implements MigrationInterface {
  name = "SetMultiLanguageAnalyzerLanguages1794614400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "analyzer" SET "language_config" = '{"javascript":{"plugins":["js-sbom","vuln-finder","license-finder"]},"php":{"plugins":["php-sbom","vuln-finder","license-finder"]}}'::jsonb WHERE "name" = 'Multi-Language Analyzer' AND "language_config" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "analyzer" SET "language_config" = NULL WHERE "name" = 'Multi-Language Analyzer'`,
    );
  }
}
