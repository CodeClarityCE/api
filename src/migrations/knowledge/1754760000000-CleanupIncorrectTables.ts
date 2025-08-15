import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupIncorrectTables1754760000000 implements MigrationInterface {
    name = 'CleanupIncorrectTables1754760000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop all tables that belong in the codeclarity database, not knowledge database
        // These were incorrectly copied by a previous migration
        
        // Drop foreign key constraints first to avoid dependency issues
        await queryRunner.query(`DROP TABLE IF EXISTS "policy_analyses_analysis" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_projects_project" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_policies_policy" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_integrations_integration" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_notifications_notification" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_owners_user" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "user_integrations_integration" CASCADE`);
        
        // Drop main application tables (these belong in codeclarity database)
        await queryRunner.query(`DROP TABLE IF EXISTS "result" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "analysis" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "file" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "project" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "analyzer" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "integration" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "repository_cache" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "policy" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_memberships" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "invitation" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "notification" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "email" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "log" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "user" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "plugin" CASCADE`);
        
        // Drop the enum type if it exists
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."analysis_schedule_type_enum"`);
        
        // The knowledge database should now only contain:
        // - package, js_version, version (package management)
        // - cwe, nvd, osv, epss (vulnerability data)
        // - licenses (license data)
        // - migrations (migration tracking)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This migration cannot be safely reverted as it removes incorrectly placed tables
        // The correct approach would be to restore from backup if needed
        throw new Error('This migration cannot be reverted. Restore from backup if needed.');
    }
}