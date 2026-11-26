import { MigrationInterface, QueryRunner } from "typeorm";

// Keys cached repositories by the provider's id, so a sync updates and removes them.
export class AddRepositoryCacheProviderId1796385600000 implements MigrationInterface {
  name = "AddRepositoryCacheProviderId1796385600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop duplicate rows of one repository; the next sync refills the cache.
    await queryRunner.query(
      `DELETE FROM "repository_cache" a USING "repository_cache" b
       WHERE a."integrationId" = b."integrationId" AND a."url" = b."url" AND a."id" > b."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "repository_cache" ADD "provider_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "repository_cache" ADD CONSTRAINT "UQ_repository_cache_integration_provider_id" UNIQUE ("integrationId", "provider_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repository_cache" DROP CONSTRAINT "UQ_repository_cache_integration_provider_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "repository_cache" DROP COLUMN "provider_id"`,
    );
  }
}
