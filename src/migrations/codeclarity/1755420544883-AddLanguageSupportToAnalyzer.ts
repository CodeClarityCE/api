import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLanguageSupportToAnalyzer1755420544883 implements MigrationInterface {
    name = 'AddLanguageSupportToAnalyzer1755420544883';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b23e12326a4218d09bd72301aa"`);
        await queryRunner.query(
            `CREATE TABLE "version" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "version" character varying(255) NOT NULL, "dependencies" jsonb, "dev_dependencies" jsonb, "extra" jsonb, "package_id" character varying, "packageId" uuid, CONSTRAINT "PK_4fb5fbb15a43da9f35493107b1d" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_efaf48ac3246f46e661a338640" ON "version" ("version") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_11b2b7911ddb3ef266b1dafadc" ON "version" ("package_id") `
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_bf51b0714db5797935da2e64a1" ON "version" ("package_id", "version") `
        );
        await queryRunner.query(
            `ALTER TABLE "analyzer" ADD "supported_languages" character varying array NOT NULL DEFAULT '{javascript}'`
        );
        await queryRunner.query(`ALTER TABLE "analyzer" ADD "language_config" jsonb`);
        await queryRunner.query(
            `ALTER TABLE "analyzer" ADD "logo" character varying(50) NOT NULL DEFAULT 'js'`
        );
        await queryRunner.query(
            `ALTER TABLE "package" ADD "language" character varying(50) DEFAULT 'javascript'`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_921eb527e0524bedec502f33df" ON "package" ("language") `
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_39ff8ef2cc3c9049db3deec202" ON "package" ("name", "language") `
        );
        await queryRunner.query(
            `ALTER TABLE "version" ADD CONSTRAINT "FK_c43a9358b140a64faa3584e8eda" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "version" DROP CONSTRAINT "FK_c43a9358b140a64faa3584e8eda"`
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_39ff8ef2cc3c9049db3deec202"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_921eb527e0524bedec502f33df"`);
        await queryRunner.query(`ALTER TABLE "package" DROP COLUMN "language"`);
        await queryRunner.query(`ALTER TABLE "analyzer" DROP COLUMN "logo"`);
        await queryRunner.query(`ALTER TABLE "analyzer" DROP COLUMN "language_config"`);
        await queryRunner.query(`ALTER TABLE "analyzer" DROP COLUMN "supported_languages"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bf51b0714db5797935da2e64a1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_11b2b7911ddb3ef266b1dafadc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_efaf48ac3246f46e661a338640"`);
        await queryRunner.query(`DROP TABLE "version"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b23e12326a4218d09bd72301aa" ON "package" ("name") `
        );
    }
}
