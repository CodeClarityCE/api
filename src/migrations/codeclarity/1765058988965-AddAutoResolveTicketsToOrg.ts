import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutoResolveTicketsToOrg1765058988965 implements MigrationInterface {
    name = 'AddAutoResolveTicketsToOrg1765058988965';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization" ADD "auto_resolve_tickets" boolean NOT NULL DEFAULT false`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "organization" DROP COLUMN "auto_resolve_tickets"`);
    }
}
