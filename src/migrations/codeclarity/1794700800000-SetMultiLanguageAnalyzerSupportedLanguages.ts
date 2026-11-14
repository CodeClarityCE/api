import { MigrationInterface, QueryRunner } from "typeorm";

// Lets the seeded analyzer plan PHP plugins. Needs dispatcher language
// selection, or JavaScript-only projects would fail on php-sbom again.
export class SetMultiLanguageAnalyzerSupportedLanguages1794700800000 implements MigrationInterface {
  name = "SetMultiLanguageAnalyzerSupportedLanguages1794700800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "analyzer" SET "supported_languages" = '{javascript,php}' WHERE "name" = 'Multi-Language Analyzer' AND "language_config" ?& array['javascript','php']`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "analyzer" SET "supported_languages" = '{javascript}' WHERE "name" = 'Multi-Language Analyzer' AND "language_config" ?& array['javascript','php']`,
    );
  }
}
