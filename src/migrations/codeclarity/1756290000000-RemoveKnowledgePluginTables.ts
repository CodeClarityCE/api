import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveKnowledgePluginTables1756290000000 implements MigrationInterface {
    name = 'RemoveKnowledgePluginTables1756290000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop knowledge and plugin tables from codeclarity database
        // These tables belong in their respective 'knowledge' and 'plugins' databases
        // They were mistakenly created here due to autoLoadEntities including all entities

        // Drop knowledge-related tables
        await queryRunner.query(`DROP TABLE IF EXISTS "cwe" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "epss" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "licenses" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "nvd" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "osv" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "version" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "package" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "friends_of_php" CASCADE`);

        // Drop plugin table (belongs in 'plugins' database)
        await queryRunner.query(`DROP TABLE IF EXISTS "plugin" CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No down migration - these tables should never have existed in codeclarity DB
        // They exist in their proper databases (knowledge and plugins)
        // If a rollback is needed, the tables will be recreated by TypeORM synchronization
        // or from the proper database dumps
    }
}
