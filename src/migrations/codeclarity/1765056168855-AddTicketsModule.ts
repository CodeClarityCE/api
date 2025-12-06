import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketsModule1765056168855 implements MigrationInterface {
    name = 'AddTicketsModule1765056168855';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."ticket_status_enum" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX')`
        );
        await queryRunner.query(
            `CREATE TYPE "public"."ticket_priority_enum" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')`
        );
        await queryRunner.query(
            `CREATE TYPE "public"."ticket_type_enum" AS ENUM('VULNERABILITY', 'LICENSE', 'UPGRADE')`
        );
        await queryRunner.query(
            `CREATE TABLE "ticket" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(200) NOT NULL, "description" text NOT NULL, "status" "public"."ticket_status_enum" NOT NULL DEFAULT 'OPEN', "priority" "public"."ticket_priority_enum" NOT NULL, "type" "public"."ticket_type_enum" NOT NULL, "vulnerability_id" character varying(100), "affected_package" character varying(200), "affected_version" character varying(50), "severity_score" double precision, "severity_class" character varying(20), "recommended_version" character varying(50), "remediation_notes" text, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_on" TIMESTAMP WITH TIME ZONE, "resolved_on" TIMESTAMP WITH TIME ZONE, "due_date" TIMESTAMP WITH TIME ZONE, "projectId" uuid, "organizationId" uuid, "createdById" uuid, "assignedToId" uuid, "sourceAnalysisId" uuid, CONSTRAINT "PK_d9a0835407701eb86f874474b7c" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7598db282de7bcfe43ecb9a430" ON "ticket" ("vulnerability_id") `
        );
        await queryRunner.query(
            `CREATE TABLE "ticket_vulnerability_occurrence" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspace" character varying(200) NOT NULL, "affected_paths" jsonb NOT NULL, "detected_on" TIMESTAMP WITH TIME ZONE NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "resolved_on" TIMESTAMP WITH TIME ZONE, "ticketId" uuid, "analysisId" uuid, CONSTRAINT "PK_89a8b3745c959994a85078903af" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TYPE "public"."ticket_external_link_provider_enum" AS ENUM('CLICKUP', 'JIRA', 'LINEAR')`
        );
        await queryRunner.query(
            `CREATE TABLE "ticket_external_link" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" "public"."ticket_external_link_provider_enum" NOT NULL, "external_id" character varying(100) NOT NULL, "external_url" character varying(500) NOT NULL, "synced_on" TIMESTAMP WITH TIME ZONE NOT NULL, "sync_enabled" boolean NOT NULL DEFAULT true, "ticketId" uuid, CONSTRAINT "PK_0907b6813f98f33e9b0fd60bfc1" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TYPE "public"."ticket_integration_config_provider_enum" AS ENUM('CLICKUP', 'JIRA', 'LINEAR')`
        );
        await queryRunner.query(
            `CREATE TABLE "ticket_integration_config" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" "public"."ticket_integration_config_provider_enum" NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "config" jsonb NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_on" TIMESTAMP WITH TIME ZONE, "organizationId" uuid, CONSTRAINT "UQ_03b5d4b76f46aa80ee3fa9c15bf" UNIQUE ("organizationId", "provider"), CONSTRAINT "PK_df1e1cb02821da14c1b4a90fce7" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TYPE "public"."ticket_event_event_type_enum" AS ENUM('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'SYNCED_EXTERNAL', 'UNLINKED_EXTERNAL', 'OCCURRENCE_ADDED', 'OCCURRENCE_RESOLVED', 'RESOLVED', 'REOPENED', 'COMMENT_ADDED', 'DUE_DATE_CHANGED')`
        );
        await queryRunner.query(
            `CREATE TABLE "ticket_event" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_type" "public"."ticket_event_event_type_enum" NOT NULL, "event_data" jsonb NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "ticketId" uuid, "performedById" uuid, CONSTRAINT "PK_902a22d2110174b48925314c875" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" ADD CONSTRAINT "FK_c6f47d3e270123ccd2f16f13d29" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" ADD CONSTRAINT "FK_b87c4da6a3ca9c54aa3e93a96f6" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" ADD CONSTRAINT "FK_cdd21a6b9c9d8ccb0de1c695e7e" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" ADD CONSTRAINT "FK_fc73d71fe3965e8bf6ff9560c10" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" ADD CONSTRAINT "FK_c8e3489ee961642f35cdf610564" FOREIGN KEY ("sourceAnalysisId") REFERENCES "analysis"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_vulnerability_occurrence" ADD CONSTRAINT "FK_288338f97329cc8c2ea388e80e1" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_vulnerability_occurrence" ADD CONSTRAINT "FK_347267f6bd37be65ee3388a82e4" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_external_link" ADD CONSTRAINT "FK_02f4e05e0f1a29069000ec1bd1b" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_integration_config" ADD CONSTRAINT "FK_37f2e28bc22cfe388adbbda34fa" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_event" ADD CONSTRAINT "FK_52ad15979fca7c3e0e008a51ba2" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_event" ADD CONSTRAINT "FK_63b99393e8d51af6fc09be4a676" FOREIGN KEY ("performedById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "ticket_event" DROP CONSTRAINT "FK_63b99393e8d51af6fc09be4a676"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_event" DROP CONSTRAINT "FK_52ad15979fca7c3e0e008a51ba2"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_integration_config" DROP CONSTRAINT "FK_37f2e28bc22cfe388adbbda34fa"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_external_link" DROP CONSTRAINT "FK_02f4e05e0f1a29069000ec1bd1b"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_vulnerability_occurrence" DROP CONSTRAINT "FK_347267f6bd37be65ee3388a82e4"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_vulnerability_occurrence" DROP CONSTRAINT "FK_288338f97329cc8c2ea388e80e1"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" DROP CONSTRAINT "FK_c8e3489ee961642f35cdf610564"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" DROP CONSTRAINT "FK_fc73d71fe3965e8bf6ff9560c10"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" DROP CONSTRAINT "FK_cdd21a6b9c9d8ccb0de1c695e7e"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" DROP CONSTRAINT "FK_b87c4da6a3ca9c54aa3e93a96f6"`
        );
        await queryRunner.query(
            `ALTER TABLE "ticket" DROP CONSTRAINT "FK_c6f47d3e270123ccd2f16f13d29"`
        );
        await queryRunner.query(`DROP TABLE "ticket_event"`);
        await queryRunner.query(`DROP TYPE "public"."ticket_event_event_type_enum"`);
        await queryRunner.query(`DROP TABLE "ticket_integration_config"`);
        await queryRunner.query(`DROP TYPE "public"."ticket_integration_config_provider_enum"`);
        await queryRunner.query(`DROP TABLE "ticket_external_link"`);
        await queryRunner.query(`DROP TYPE "public"."ticket_external_link_provider_enum"`);
        await queryRunner.query(`DROP TABLE "ticket_vulnerability_occurrence"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7598db282de7bcfe43ecb9a430"`);
        await queryRunner.query(`DROP TABLE "ticket"`);
        await queryRunner.query(`DROP TYPE "public"."ticket_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."ticket_priority_enum"`);
        await queryRunner.query(`DROP TYPE "public"."ticket_status_enum"`);
    }
}
