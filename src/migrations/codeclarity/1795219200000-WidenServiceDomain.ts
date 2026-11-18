import { MigrationInterface, QueryRunner } from "typeorm";

// Widens service_domain so self-hosted GitLab URLs fit. Values are kept.
export class WidenServiceDomain1795219200000 implements MigrationInterface {
  name = "WidenServiceDomain1795219200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration" ALTER COLUMN "service_domain" TYPE character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project" ALTER COLUMN "service_domain" TYPE character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project" ALTER COLUMN "service_domain" TYPE character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration" ALTER COLUMN "service_domain" TYPE character varying(25)`,
    );
  }
}
