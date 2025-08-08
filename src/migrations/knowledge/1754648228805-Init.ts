import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1754648228805 implements MigrationInterface {
    name = 'Init1754648228805';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."osv_affected_gin_pathops_idx"`);
        await queryRunner.query(`DROP INDEX "public"."nvd_affectedflattened_gin_pathops_idx"`);
        await queryRunner.query(
            `CREATE TABLE "result" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "result" jsonb NOT NULL, "plugin" character varying NOT NULL, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "analysisId" uuid, CONSTRAINT "PK_c93b145f3c2e95f6d9e21d188e2" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "handle" character varying(100) NOT NULL, "email" character varying(100) NOT NULL, "social" boolean NOT NULL, "social_register_type" character varying, "setup_done" boolean NOT NULL, "activated" boolean NOT NULL, "avatar_url" character varying(100), "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "registration_verified" boolean NOT NULL, "password" character varying(100) NOT NULL, "setup_temporary_conf" character varying, "oauth_integration" character varying, "social_id" character varying, "default_org" uuid, CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_53197e5dba5dbaf94d29c8edbd" ON "user" ("handle") `
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user" ("email") `
        );
        await queryRunner.query(
            `CREATE TABLE "organization_memberships" ("organizationMembershipId" uuid NOT NULL DEFAULT uuid_generate_v4(), "role" integer NOT NULL, "joined_on" TIMESTAMP WITH TIME ZONE NOT NULL, "userId" uuid, "organizationId" uuid, CONSTRAINT "PK_044bd8dbbac52c55847750366d2" PRIMARY KEY ("organizationMembershipId"))`
        );
        await queryRunner.query(
            `CREATE TABLE "organization" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" text NOT NULL, "color_scheme" character varying(5) NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "personal" boolean NOT NULL, "createdById" uuid, CONSTRAINT "PK_472c1f99a32def1b0abb219cd67" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "project" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "added_on" TIMESTAMP WITH TIME ZONE NOT NULL, "service_domain" character varying(100), "integration_type" character varying NOT NULL, "integration_provider" character varying NOT NULL, "invalid" boolean NOT NULL, "expiry_date" TIMESTAMP WITH TIME ZONE, "downloaded" boolean NOT NULL, "default_branch" character varying NOT NULL, "url" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying NOT NULL, "type" character varying NOT NULL, "integrationId" uuid, "addedById" uuid, CONSTRAINT "PK_4d68b1358bb5b766d3e78f32f57" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "analyzer" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(25) NOT NULL, "global" boolean NOT NULL, "description" text NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "steps" jsonb NOT NULL, "organizationId" uuid, "createdById" uuid, CONSTRAINT "PK_c437f66533df1b36637f8dd499b" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "integration" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_type" character varying(25) NOT NULL, "integration_provider" character varying(25) NOT NULL, "access_token" character varying(100) NOT NULL, "token_type" character varying(100), "refresh_token" character varying(100), "expiry_date" TIMESTAMP WITH TIME ZONE, "invalid" boolean NOT NULL, "service_domain" character varying(25) NOT NULL, "added_on" TIMESTAMP WITH TIME ZONE NOT NULL, "last_repository_sync" TIMESTAMP WITH TIME ZONE, "repositoryCacheId" uuid, "ownerId" uuid, CONSTRAINT "PK_f348d4694945d9dc4c7049a178a" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TYPE "public"."analysis_schedule_type_enum" AS ENUM('once', 'daily', 'weekly')`
        );
        await queryRunner.query(
            `CREATE TABLE "analysis" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "config" jsonb NOT NULL, "stage" integer, "status" character varying NOT NULL, "steps" jsonb NOT NULL, "started_on" TIMESTAMP WITH TIME ZONE, "ended_on" TIMESTAMP WITH TIME ZONE, "branch" character varying(25) NOT NULL, "tag" character varying(25), "commit_hash" character varying(25), "schedule_type" "public"."analysis_schedule_type_enum" DEFAULT 'once', "next_scheduled_run" TIMESTAMP WITH TIME ZONE, "is_active" boolean NOT NULL DEFAULT true, "last_scheduled_run" TIMESTAMP WITH TIME ZONE, "projectId" uuid, "analyzerId" uuid, "organizationId" uuid, "integrationId" uuid, "createdById" uuid, CONSTRAINT "PK_300795d51c57ef52911ed65851f" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "policy" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying NOT NULL, "content" jsonb NOT NULL, "policy_type" character varying NOT NULL, "default" boolean NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "createdById" uuid, CONSTRAINT "PK_9917b0c5e4286703cc656b1d39f" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "repository_cache" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "repository_type" character varying NOT NULL, "url" character varying NOT NULL, "default_branch" character varying NOT NULL, "visibility" character varying NOT NULL, "fully_qualified_name" character varying NOT NULL, "service_domain" character varying, "description" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "integrationId" uuid, CONSTRAINT "PK_5398a9847f1cf1467094fb6b6b6" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "plugin" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "version" character varying, "description" character varying, "depends_on" jsonb, "config" jsonb, CONSTRAINT "PK_9a65387180b2e67287345684c03" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "notification" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(100) NOT NULL, "description" text NOT NULL, "content" jsonb NOT NULL, "type" character varying NOT NULL, "content_type" character varying NOT NULL, CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "file" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "added_on" TIMESTAMP WITH TIME ZONE NOT NULL, "type" character varying NOT NULL, "name" character varying NOT NULL, "projectId" uuid, "addedById" uuid, CONSTRAINT "PK_36b46d232307066b3a2c9ea3a1d" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "email" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token_digest" character varying(250) NOT NULL, "email_type" character varying NOT NULL, "user_id_digest" character varying(250) NOT NULL, "ttl" TIMESTAMP WITH TIME ZONE, "userId" uuid, CONSTRAINT "PK_1e7ed8734ee054ef18002e29b1c" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "action_severity" integer NOT NULL, "action_class" character varying(25) NOT NULL, "action" character varying(50) NOT NULL, "description" text NOT NULL, "blame_on_email" character varying(100) NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "organization_id" character varying NOT NULL, "blame_on" character varying, "organizationId" uuid, CONSTRAINT "PK_350604cbdf991d5930d9e618fbd" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "invitation" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_on" TIMESTAMP WITH TIME ZONE, "role" integer NOT NULL, "token_digest" character varying(250) NOT NULL, "user_email_digest" character varying(250) NOT NULL, "ttl" TIMESTAMP WITH TIME ZONE, "organizationId" uuid, "userId" uuid, CONSTRAINT "PK_beb994737756c0f18a1c1f8669c" PRIMARY KEY ("id"))`
        );
        await queryRunner.query(
            `CREATE TABLE "user_integrations_integration" ("userId" uuid NOT NULL, "integrationId" uuid NOT NULL, CONSTRAINT "PK_adb1ecc45c62ecd7ef088fa28e3" PRIMARY KEY ("userId", "integrationId"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_33a3a7d9338aef1a5afc5a14ae" ON "user_integrations_integration" ("userId") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_04aa9f6ff0abf3357255a4933d" ON "user_integrations_integration" ("integrationId") `
        );
        await queryRunner.query(
            `CREATE TABLE "organization_owners_user" ("organizationId" uuid NOT NULL, "userId" uuid NOT NULL, CONSTRAINT "PK_bf5c380b80d790b683043c9053a" PRIMARY KEY ("organizationId", "userId"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_901f7fff05911c8f8a70ad4303" ON "organization_owners_user" ("organizationId") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_88b667e5dae95396b7204367e8" ON "organization_owners_user" ("userId") `
        );
        await queryRunner.query(
            `CREATE TABLE "organization_notifications_notification" ("organizationId" uuid NOT NULL, "notificationId" uuid NOT NULL, CONSTRAINT "PK_fef6ed90cf95e30a6ef6dbc710e" PRIMARY KEY ("organizationId", "notificationId"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_9d6c46508f2fe2646c79e260ca" ON "organization_notifications_notification" ("organizationId") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_4d950e31d0c273d925f139e44f" ON "organization_notifications_notification" ("notificationId") `
        );
        await queryRunner.query(
            `CREATE TABLE "organization_integrations_integration" ("organizationId" uuid NOT NULL, "integrationId" uuid NOT NULL, CONSTRAINT "PK_5797616a24551c910e8e615d889" PRIMARY KEY ("organizationId", "integrationId"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_8031a218fc98f33b1f7e4a5ae2" ON "organization_integrations_integration" ("organizationId") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_fe96bdf9bb90fadbf29b26eaea" ON "organization_integrations_integration" ("integrationId") `
        );
        await queryRunner.query(
            `CREATE TABLE "organization_policies_policy" ("organizationId" uuid NOT NULL, "policyId" uuid NOT NULL, CONSTRAINT "PK_88524c8990982c8fff0540171b1" PRIMARY KEY ("organizationId", "policyId"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d0233589b7e4fb44d94f913fe2" ON "organization_policies_policy" ("organizationId") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_d498b6d647ffbea1335926fb52" ON "organization_policies_policy" ("policyId") `
        );
        await queryRunner.query(
            `CREATE TABLE "organization_projects_project" ("organizationId" uuid NOT NULL, "projectId" uuid NOT NULL, CONSTRAINT "PK_cd80712b94074424b05997a82a9" PRIMARY KEY ("organizationId", "projectId"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_60c8536082fe2e5f8339cbeb18" ON "organization_projects_project" ("organizationId") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_17776fcac5925a1b9c2de6659e" ON "organization_projects_project" ("projectId") `
        );
        await queryRunner.query(
            `CREATE TABLE "policy_analyses_analysis" ("policyId" uuid NOT NULL, "analysisId" uuid NOT NULL, CONSTRAINT "PK_d2a3d10e3ce2fcdf9fd37845304" PRIMARY KEY ("policyId", "analysisId"))`
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_07894cf183f76e751a0d3780f0" ON "policy_analyses_analysis" ("policyId") `
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_90093d0834ea74459c93278d1b" ON "policy_analyses_analysis" ("analysisId") `
        );
        await queryRunner.query(
            `ALTER TABLE "result" ADD CONSTRAINT "FK_702c70a45c5fa40056e49d9392d" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "user" ADD CONSTRAINT "FK_a64608a253f14da7ba2a6b96a7c" FOREIGN KEY ("default_org") REFERENCES "organization"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_03b536604ff6c6676b51b74b1c9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_1813e7f46b5a18529482f519640" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization" ADD CONSTRAINT "FK_acdbd1e490930af04b4ff569ca9" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "project" ADD CONSTRAINT "FK_cfed2edf0775ca6190bf1d303f7" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "project" ADD CONSTRAINT "FK_05503c29fac80fff9fa5bd7726b" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "analyzer" ADD CONSTRAINT "FK_539f3b47367c4e5a5ab0d41f949" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "analyzer" ADD CONSTRAINT "FK_494071d44abce6125c0c476c32d" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "integration" ADD CONSTRAINT "FK_e9ec70d1a8888315f1315184b75" FOREIGN KEY ("repositoryCacheId") REFERENCES "repository_cache"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "integration" ADD CONSTRAINT "FK_f470dfd06183e7bfa12e4ed7d51" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD CONSTRAINT "FK_0c55929c37d981ded07299eacbb" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD CONSTRAINT "FK_a4a8de4720688b3b6acaac1b71b" FOREIGN KEY ("analyzerId") REFERENCES "analyzer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD CONSTRAINT "FK_76314241964b011dfcbdf224cc9" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD CONSTRAINT "FK_68d210afa0728c14a981c7856d0" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" ADD CONSTRAINT "FK_09f02cb54cca89e00638a376935" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "policy" ADD CONSTRAINT "FK_e2a559dc71c48a5f3514b2e91c3" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "repository_cache" ADD CONSTRAINT "FK_80730191d462c7a9dd72b6b3c4f" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "file" ADD CONSTRAINT "FK_29151b59ad12b96cd2d9e3a9cfc" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "file" ADD CONSTRAINT "FK_619041430199c7248662341ec8e" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "email" ADD CONSTRAINT "FK_13e97b4a1d6074fd75ea1bb844e" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "log" ADD CONSTRAINT "FK_0a14b37f3d6f5be425bc0f080d8" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "invitation" ADD CONSTRAINT "FK_5c00d7d515395f91bd1fee19f32" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "invitation" ADD CONSTRAINT "FK_05191060fae5b5485327709be7f" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "user_integrations_integration" ADD CONSTRAINT "FK_33a3a7d9338aef1a5afc5a14ae4" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE`
        );
        await queryRunner.query(
            `ALTER TABLE "user_integrations_integration" ADD CONSTRAINT "FK_04aa9f6ff0abf3357255a4933d0" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_owners_user" ADD CONSTRAINT "FK_901f7fff05911c8f8a70ad43032" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_owners_user" ADD CONSTRAINT "FK_88b667e5dae95396b7204367e80" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_notifications_notification" ADD CONSTRAINT "FK_9d6c46508f2fe2646c79e260ca8" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_notifications_notification" ADD CONSTRAINT "FK_4d950e31d0c273d925f139e44f9" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_integrations_integration" ADD CONSTRAINT "FK_8031a218fc98f33b1f7e4a5ae27" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_integrations_integration" ADD CONSTRAINT "FK_fe96bdf9bb90fadbf29b26eaea8" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_policies_policy" ADD CONSTRAINT "FK_d0233589b7e4fb44d94f913fe29" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_policies_policy" ADD CONSTRAINT "FK_d498b6d647ffbea1335926fb529" FOREIGN KEY ("policyId") REFERENCES "policy"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_projects_project" ADD CONSTRAINT "FK_60c8536082fe2e5f8339cbeb18a" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_projects_project" ADD CONSTRAINT "FK_17776fcac5925a1b9c2de6659e2" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
        await queryRunner.query(
            `ALTER TABLE "policy_analyses_analysis" ADD CONSTRAINT "FK_07894cf183f76e751a0d3780f08" FOREIGN KEY ("policyId") REFERENCES "policy"("id") ON DELETE CASCADE ON UPDATE CASCADE`
        );
        await queryRunner.query(
            `ALTER TABLE "policy_analyses_analysis" ADD CONSTRAINT "FK_90093d0834ea74459c93278d1be" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "policy_analyses_analysis" DROP CONSTRAINT "FK_90093d0834ea74459c93278d1be"`
        );
        await queryRunner.query(
            `ALTER TABLE "policy_analyses_analysis" DROP CONSTRAINT "FK_07894cf183f76e751a0d3780f08"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_projects_project" DROP CONSTRAINT "FK_17776fcac5925a1b9c2de6659e2"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_projects_project" DROP CONSTRAINT "FK_60c8536082fe2e5f8339cbeb18a"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_policies_policy" DROP CONSTRAINT "FK_d498b6d647ffbea1335926fb529"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_policies_policy" DROP CONSTRAINT "FK_d0233589b7e4fb44d94f913fe29"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_integrations_integration" DROP CONSTRAINT "FK_fe96bdf9bb90fadbf29b26eaea8"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_integrations_integration" DROP CONSTRAINT "FK_8031a218fc98f33b1f7e4a5ae27"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_notifications_notification" DROP CONSTRAINT "FK_4d950e31d0c273d925f139e44f9"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_notifications_notification" DROP CONSTRAINT "FK_9d6c46508f2fe2646c79e260ca8"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_owners_user" DROP CONSTRAINT "FK_88b667e5dae95396b7204367e80"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_owners_user" DROP CONSTRAINT "FK_901f7fff05911c8f8a70ad43032"`
        );
        await queryRunner.query(
            `ALTER TABLE "user_integrations_integration" DROP CONSTRAINT "FK_04aa9f6ff0abf3357255a4933d0"`
        );
        await queryRunner.query(
            `ALTER TABLE "user_integrations_integration" DROP CONSTRAINT "FK_33a3a7d9338aef1a5afc5a14ae4"`
        );
        await queryRunner.query(
            `ALTER TABLE "invitation" DROP CONSTRAINT "FK_05191060fae5b5485327709be7f"`
        );
        await queryRunner.query(
            `ALTER TABLE "invitation" DROP CONSTRAINT "FK_5c00d7d515395f91bd1fee19f32"`
        );
        await queryRunner.query(
            `ALTER TABLE "log" DROP CONSTRAINT "FK_0a14b37f3d6f5be425bc0f080d8"`
        );
        await queryRunner.query(
            `ALTER TABLE "email" DROP CONSTRAINT "FK_13e97b4a1d6074fd75ea1bb844e"`
        );
        await queryRunner.query(
            `ALTER TABLE "file" DROP CONSTRAINT "FK_619041430199c7248662341ec8e"`
        );
        await queryRunner.query(
            `ALTER TABLE "file" DROP CONSTRAINT "FK_29151b59ad12b96cd2d9e3a9cfc"`
        );
        await queryRunner.query(
            `ALTER TABLE "repository_cache" DROP CONSTRAINT "FK_80730191d462c7a9dd72b6b3c4f"`
        );
        await queryRunner.query(
            `ALTER TABLE "policy" DROP CONSTRAINT "FK_e2a559dc71c48a5f3514b2e91c3"`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" DROP CONSTRAINT "FK_09f02cb54cca89e00638a376935"`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" DROP CONSTRAINT "FK_68d210afa0728c14a981c7856d0"`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" DROP CONSTRAINT "FK_76314241964b011dfcbdf224cc9"`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" DROP CONSTRAINT "FK_a4a8de4720688b3b6acaac1b71b"`
        );
        await queryRunner.query(
            `ALTER TABLE "analysis" DROP CONSTRAINT "FK_0c55929c37d981ded07299eacbb"`
        );
        await queryRunner.query(
            `ALTER TABLE "integration" DROP CONSTRAINT "FK_f470dfd06183e7bfa12e4ed7d51"`
        );
        await queryRunner.query(
            `ALTER TABLE "integration" DROP CONSTRAINT "FK_e9ec70d1a8888315f1315184b75"`
        );
        await queryRunner.query(
            `ALTER TABLE "analyzer" DROP CONSTRAINT "FK_494071d44abce6125c0c476c32d"`
        );
        await queryRunner.query(
            `ALTER TABLE "analyzer" DROP CONSTRAINT "FK_539f3b47367c4e5a5ab0d41f949"`
        );
        await queryRunner.query(
            `ALTER TABLE "project" DROP CONSTRAINT "FK_05503c29fac80fff9fa5bd7726b"`
        );
        await queryRunner.query(
            `ALTER TABLE "project" DROP CONSTRAINT "FK_cfed2edf0775ca6190bf1d303f7"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization" DROP CONSTRAINT "FK_acdbd1e490930af04b4ff569ca9"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_1813e7f46b5a18529482f519640"`
        );
        await queryRunner.query(
            `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_03b536604ff6c6676b51b74b1c9"`
        );
        await queryRunner.query(
            `ALTER TABLE "user" DROP CONSTRAINT "FK_a64608a253f14da7ba2a6b96a7c"`
        );
        await queryRunner.query(
            `ALTER TABLE "result" DROP CONSTRAINT "FK_702c70a45c5fa40056e49d9392d"`
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_90093d0834ea74459c93278d1b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_07894cf183f76e751a0d3780f0"`);
        await queryRunner.query(`DROP TABLE "policy_analyses_analysis"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_17776fcac5925a1b9c2de6659e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_60c8536082fe2e5f8339cbeb18"`);
        await queryRunner.query(`DROP TABLE "organization_projects_project"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d498b6d647ffbea1335926fb52"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d0233589b7e4fb44d94f913fe2"`);
        await queryRunner.query(`DROP TABLE "organization_policies_policy"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe96bdf9bb90fadbf29b26eaea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8031a218fc98f33b1f7e4a5ae2"`);
        await queryRunner.query(`DROP TABLE "organization_integrations_integration"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4d950e31d0c273d925f139e44f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9d6c46508f2fe2646c79e260ca"`);
        await queryRunner.query(`DROP TABLE "organization_notifications_notification"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_88b667e5dae95396b7204367e8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_901f7fff05911c8f8a70ad4303"`);
        await queryRunner.query(`DROP TABLE "organization_owners_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_04aa9f6ff0abf3357255a4933d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_33a3a7d9338aef1a5afc5a14ae"`);
        await queryRunner.query(`DROP TABLE "user_integrations_integration"`);
        await queryRunner.query(`DROP TABLE "invitation"`);
        await queryRunner.query(`DROP TABLE "log"`);
        await queryRunner.query(`DROP TABLE "email"`);
        await queryRunner.query(`DROP TABLE "file"`);
        await queryRunner.query(`DROP TABLE "notification"`);
        await queryRunner.query(`DROP TABLE "plugin"`);
        await queryRunner.query(`DROP TABLE "repository_cache"`);
        await queryRunner.query(`DROP TABLE "policy"`);
        await queryRunner.query(`DROP TABLE "analysis"`);
        await queryRunner.query(`DROP TYPE "public"."analysis_schedule_type_enum"`);
        await queryRunner.query(`DROP TABLE "integration"`);
        await queryRunner.query(`DROP TABLE "analyzer"`);
        await queryRunner.query(`DROP TABLE "project"`);
        await queryRunner.query(`DROP TABLE "organization"`);
        await queryRunner.query(`DROP TABLE "organization_memberships"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_53197e5dba5dbaf94d29c8edbd"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP TABLE "result"`);
        await queryRunner.query(
            `CREATE INDEX "nvd_affectedflattened_gin_pathops_idx" ON "nvd" ("affectedFlattened") `
        );
        await queryRunner.query(
            `CREATE INDEX "osv_affected_gin_pathops_idx" ON "osv" ("affected") `
        );
    }
}
