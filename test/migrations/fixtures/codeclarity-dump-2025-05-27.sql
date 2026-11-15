-- Schema of the codeclarity dev dump that setup used to restore (archive created 2025-05-27 11:51:55 UTC, pg_dump 17.5),
-- taken from its table of contents. Same as pg_restore --schema-only without owners.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';

CREATE TABLE public.analysis (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_on timestamp with time zone NOT NULL,
    config jsonb NOT NULL,
    stage integer,
    status character varying NOT NULL,
    steps jsonb NOT NULL,
    started_on timestamp with time zone,
    ended_on timestamp with time zone,
    branch character varying(25) NOT NULL,
    tag character varying(25),
    commit_hash character varying(25),
    "projectId" uuid,
    "analyzerId" uuid,
    "organizationId" uuid,
    "integrationId" uuid,
    "createdById" uuid
);

CREATE TABLE public.analyzer (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(25) NOT NULL,
    description text NOT NULL,
    created_on timestamp with time zone NOT NULL,
    steps jsonb NOT NULL,
    "organizationId" uuid,
    "createdById" uuid,
    global boolean NOT NULL
);

CREATE TABLE public.email (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    token_digest character varying(250) NOT NULL,
    email_type character varying NOT NULL,
    user_id_digest character varying(250) NOT NULL,
    ttl timestamp with time zone,
    "userId" uuid
);

CREATE TABLE public.file (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    added_on timestamp with time zone NOT NULL,
    type character varying NOT NULL,
    name character varying NOT NULL,
    "projectId" uuid,
    "addedById" uuid
);

CREATE TABLE public.integration (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    integration_type character varying(25) NOT NULL,
    integration_provider character varying(25) NOT NULL,
    access_token character varying(100) NOT NULL,
    token_type character varying(100),
    refresh_token character varying(100),
    expiry_date timestamp with time zone,
    invalid boolean NOT NULL,
    service_domain character varying(25) NOT NULL,
    added_on timestamp with time zone NOT NULL,
    last_repository_sync timestamp with time zone,
    "repositoryCacheId" uuid,
    "ownerId" uuid
);

CREATE TABLE public.invitation (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_on timestamp with time zone,
    role integer NOT NULL,
    token_digest character varying(250) NOT NULL,
    user_email_digest character varying(250) NOT NULL,
    ttl timestamp with time zone,
    "organizationId" uuid,
    "userId" uuid
);

CREATE TABLE public.log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    action_severity integer NOT NULL,
    action_class character varying(25) NOT NULL,
    action character varying(50) NOT NULL,
    description text NOT NULL,
    blame_on_email character varying(100) NOT NULL,
    created_on timestamp with time zone NOT NULL,
    organization_id character varying NOT NULL,
    blame_on character varying,
    "organizationId" uuid
);

CREATE TABLE public.notification (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(100) NOT NULL,
    description text NOT NULL,
    content jsonb NOT NULL,
    type character varying NOT NULL,
    content_type character varying NOT NULL
);

CREATE TABLE public.organization (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text NOT NULL,
    color_scheme character varying(5) NOT NULL,
    created_on timestamp with time zone NOT NULL,
    personal boolean NOT NULL,
    "createdById" uuid
);

CREATE TABLE public.organization_integrations_integration (
    "organizationId" uuid NOT NULL,
    "integrationId" uuid NOT NULL
);

CREATE TABLE public.organization_invited_user (
    "organizationId" uuid NOT NULL,
    "userId" uuid NOT NULL
);

CREATE TABLE public.organization_memberships (
    "organizationMembershipId" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" uuid,
    "userId" uuid,
    role integer NOT NULL,
    joined_on timestamp with time zone NOT NULL
);

CREATE TABLE public.organization_notifications_notification (
    "organizationId" uuid NOT NULL,
    "notificationId" uuid NOT NULL
);

CREATE TABLE public.organization_owners_user (
    "organizationId" uuid NOT NULL,
    "userId" uuid NOT NULL
);

CREATE TABLE public.organization_policies_policy (
    "organizationId" uuid NOT NULL,
    "policyId" uuid NOT NULL
);

CREATE TABLE public.organization_projects_project (
    "organizationId" uuid NOT NULL,
    "projectId" uuid NOT NULL
);

CREATE TABLE public.policy (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    description character varying NOT NULL,
    content jsonb NOT NULL,
    policy_type character varying NOT NULL,
    "default" boolean NOT NULL,
    created_on timestamp with time zone NOT NULL,
    "createdById" uuid
);

CREATE TABLE public.policy_analyses_analysis (
    "policyId" uuid NOT NULL,
    "analysisId" uuid NOT NULL
);

CREATE TABLE public.project (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    added_on timestamp with time zone NOT NULL,
    service_domain character varying(100),
    integration_type character varying NOT NULL,
    integration_provider character varying NOT NULL,
    invalid boolean NOT NULL,
    expiry_date timestamp with time zone,
    downloaded boolean NOT NULL,
    default_branch character varying NOT NULL,
    url character varying NOT NULL,
    name character varying NOT NULL,
    description character varying NOT NULL,
    type character varying NOT NULL,
    "integrationId" uuid,
    "addedById" uuid
);

CREATE TABLE public.repository_cache (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    repository_type character varying NOT NULL,
    url character varying NOT NULL,
    default_branch character varying NOT NULL,
    visibility character varying NOT NULL,
    fully_qualified_name character varying NOT NULL,
    service_domain character varying,
    description character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    "integrationId" uuid
);

CREATE TABLE public.result (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    result jsonb NOT NULL,
    plugin character varying NOT NULL,
    "analysisId" uuid
);

CREATE TABLE public."user" (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    handle character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    social boolean NOT NULL,
    social_register_type character varying,
    setup_done boolean NOT NULL,
    activated boolean NOT NULL,
    avatar_url character varying(100),
    created_on timestamp with time zone NOT NULL,
    registration_verified boolean NOT NULL,
    password character varying(100) NOT NULL,
    setup_temporary_conf character varying,
    oauth_integration character varying,
    social_id character varying,
    default_org uuid
);

CREATE TABLE public.user_integrations_integration (
    "userId" uuid NOT NULL,
    "integrationId" uuid NOT NULL
);

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT "PK_044bd8dbbac52c55847750366d2" PRIMARY KEY ("organizationMembershipId");

ALTER TABLE ONLY public.email
    ADD CONSTRAINT "PK_1e7ed8734ee054ef18002e29b1c" PRIMARY KEY (id);

ALTER TABLE ONLY public.analysis
    ADD CONSTRAINT "PK_300795d51c57ef52911ed65851f" PRIMARY KEY (id);

ALTER TABLE ONLY public.log
    ADD CONSTRAINT "PK_350604cbdf991d5930d9e618fbd" PRIMARY KEY (id);

ALTER TABLE ONLY public.file
    ADD CONSTRAINT "PK_36b46d232307066b3a2c9ea3a1d" PRIMARY KEY (id);

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT "PK_472c1f99a32def1b0abb219cd67" PRIMARY KEY (id);

ALTER TABLE ONLY public.project
    ADD CONSTRAINT "PK_4d68b1358bb5b766d3e78f32f57" PRIMARY KEY (id);

ALTER TABLE ONLY public.repository_cache
    ADD CONSTRAINT "PK_5398a9847f1cf1467094fb6b6b6" PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_integrations_integration
    ADD CONSTRAINT "PK_5797616a24551c910e8e615d889" PRIMARY KEY ("organizationId", "integrationId");

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_policies_policy
    ADD CONSTRAINT "PK_88524c8990982c8fff0540171b1" PRIMARY KEY ("organizationId", "policyId");

ALTER TABLE ONLY public.policy
    ADD CONSTRAINT "PK_9917b0c5e4286703cc656b1d39f" PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_invited_user
    ADD CONSTRAINT "PK_ab8f3c4b9554b5731541ffa07fa" PRIMARY KEY ("organizationId", "userId");

ALTER TABLE ONLY public.user_integrations_integration
    ADD CONSTRAINT "PK_adb1ecc45c62ecd7ef088fa28e3" PRIMARY KEY ("userId", "integrationId");

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT "PK_beb994737756c0f18a1c1f8669c" PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_owners_user
    ADD CONSTRAINT "PK_bf5c380b80d790b683043c9053a" PRIMARY KEY ("organizationId", "userId");

ALTER TABLE ONLY public.analyzer
    ADD CONSTRAINT "PK_c437f66533df1b36637f8dd499b" PRIMARY KEY (id);

ALTER TABLE ONLY public.result
    ADD CONSTRAINT "PK_c93b145f3c2e95f6d9e21d188e2" PRIMARY KEY (id);

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_projects_project
    ADD CONSTRAINT "PK_cd80712b94074424b05997a82a9" PRIMARY KEY ("organizationId", "projectId");

ALTER TABLE ONLY public.policy_analyses_analysis
    ADD CONSTRAINT "PK_d2a3d10e3ce2fcdf9fd37845304" PRIMARY KEY ("policyId", "analysisId");

ALTER TABLE ONLY public.integration
    ADD CONSTRAINT "PK_f348d4694945d9dc4c7049a178a" PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_notifications_notification
    ADD CONSTRAINT "PK_fef6ed90cf95e30a6ef6dbc710e" PRIMARY KEY ("organizationId", "notificationId");

CREATE INDEX "IDX_04aa9f6ff0abf3357255a4933d" ON public.user_integrations_integration USING btree ("integrationId");

CREATE INDEX "IDX_07894cf183f76e751a0d3780f0" ON public.policy_analyses_analysis USING btree ("policyId");

CREATE INDEX "IDX_17776fcac5925a1b9c2de6659e" ON public.organization_projects_project USING btree ("projectId");

CREATE INDEX "IDX_2a0d0829656d6a4ccc9e79c048" ON public.organization_invited_user USING btree ("userId");

CREATE INDEX "IDX_33a3a7d9338aef1a5afc5a14ae" ON public.user_integrations_integration USING btree ("userId");

CREATE INDEX "IDX_4d950e31d0c273d925f139e44f" ON public.organization_notifications_notification USING btree ("notificationId");

CREATE UNIQUE INDEX "IDX_53197e5dba5dbaf94d29c8edbd" ON public."user" USING btree (handle);

CREATE INDEX "IDX_60c8536082fe2e5f8339cbeb18" ON public.organization_projects_project USING btree ("organizationId");

CREATE INDEX "IDX_8031a218fc98f33b1f7e4a5ae2" ON public.organization_integrations_integration USING btree ("organizationId");

CREATE INDEX "IDX_88b667e5dae95396b7204367e8" ON public.organization_owners_user USING btree ("userId");

CREATE INDEX "IDX_90093d0834ea74459c93278d1b" ON public.policy_analyses_analysis USING btree ("analysisId");

CREATE INDEX "IDX_901f7fff05911c8f8a70ad4303" ON public.organization_owners_user USING btree ("organizationId");

CREATE INDEX "IDX_9d6c46508f2fe2646c79e260ca" ON public.organization_notifications_notification USING btree ("organizationId");

CREATE INDEX "IDX_d0233589b7e4fb44d94f913fe2" ON public.organization_policies_policy USING btree ("organizationId");

CREATE INDEX "IDX_d498b6d647ffbea1335926fb52" ON public.organization_policies_policy USING btree ("policyId");

CREATE UNIQUE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON public."user" USING btree (email);

CREATE INDEX "IDX_e47975a1141febe29f0fcd6ae9" ON public.organization_invited_user USING btree ("organizationId");

CREATE INDEX "IDX_fe96bdf9bb90fadbf29b26eaea" ON public.organization_integrations_integration USING btree ("integrationId");

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT "FK_03b536604ff6c6676b51b74b1c9" FOREIGN KEY ("userId") REFERENCES public."user"(id);

ALTER TABLE ONLY public.user_integrations_integration
    ADD CONSTRAINT "FK_04aa9f6ff0abf3357255a4933d0" FOREIGN KEY ("integrationId") REFERENCES public.integration(id);

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT "FK_05191060fae5b5485327709be7f" FOREIGN KEY ("userId") REFERENCES public."user"(id);

ALTER TABLE ONLY public.project
    ADD CONSTRAINT "FK_05503c29fac80fff9fa5bd7726b" FOREIGN KEY ("addedById") REFERENCES public."user"(id);

ALTER TABLE ONLY public.policy_analyses_analysis
    ADD CONSTRAINT "FK_07894cf183f76e751a0d3780f08" FOREIGN KEY ("policyId") REFERENCES public.policy(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.analysis
    ADD CONSTRAINT "FK_09f02cb54cca89e00638a376935" FOREIGN KEY ("createdById") REFERENCES public."user"(id);

ALTER TABLE ONLY public.log
    ADD CONSTRAINT "FK_0a14b37f3d6f5be425bc0f080d8" FOREIGN KEY ("organizationId") REFERENCES public.organization(id);

ALTER TABLE ONLY public.analysis
    ADD CONSTRAINT "FK_0c55929c37d981ded07299eacbb" FOREIGN KEY ("projectId") REFERENCES public.project(id);

ALTER TABLE ONLY public.email
    ADD CONSTRAINT "FK_13e97b4a1d6074fd75ea1bb844e" FOREIGN KEY ("userId") REFERENCES public."user"(id);

ALTER TABLE ONLY public.organization_projects_project
    ADD CONSTRAINT "FK_17776fcac5925a1b9c2de6659e2" FOREIGN KEY ("projectId") REFERENCES public.project(id);

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT "FK_1813e7f46b5a18529482f519640" FOREIGN KEY ("organizationId") REFERENCES public.organization(id);

ALTER TABLE ONLY public.file
    ADD CONSTRAINT "FK_29151b59ad12b96cd2d9e3a9cfc" FOREIGN KEY ("projectId") REFERENCES public.project(id);

ALTER TABLE ONLY public.organization_invited_user
    ADD CONSTRAINT "FK_2a0d0829656d6a4ccc9e79c0485" FOREIGN KEY ("userId") REFERENCES public."user"(id);

ALTER TABLE ONLY public.user_integrations_integration
    ADD CONSTRAINT "FK_33a3a7d9338aef1a5afc5a14ae4" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.analyzer
    ADD CONSTRAINT "FK_494071d44abce6125c0c476c32d" FOREIGN KEY ("createdById") REFERENCES public."user"(id);

ALTER TABLE ONLY public.organization_notifications_notification
    ADD CONSTRAINT "FK_4d950e31d0c273d925f139e44f9" FOREIGN KEY ("notificationId") REFERENCES public.notification(id);

ALTER TABLE ONLY public.analyzer
    ADD CONSTRAINT "FK_539f3b47367c4e5a5ab0d41f949" FOREIGN KEY ("organizationId") REFERENCES public.organization(id);

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT "FK_5c00d7d515395f91bd1fee19f32" FOREIGN KEY ("organizationId") REFERENCES public.organization(id);

ALTER TABLE ONLY public.organization_projects_project
    ADD CONSTRAINT "FK_60c8536082fe2e5f8339cbeb18a" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.file
    ADD CONSTRAINT "FK_619041430199c7248662341ec8e" FOREIGN KEY ("addedById") REFERENCES public."user"(id);

ALTER TABLE ONLY public.analysis
    ADD CONSTRAINT "FK_68d210afa0728c14a981c7856d0" FOREIGN KEY ("integrationId") REFERENCES public.integration(id);

ALTER TABLE ONLY public.result
    ADD CONSTRAINT "FK_702c70a45c5fa40056e49d9392d" FOREIGN KEY ("analysisId") REFERENCES public.analysis(id);

ALTER TABLE ONLY public.analysis
    ADD CONSTRAINT "FK_76314241964b011dfcbdf224cc9" FOREIGN KEY ("organizationId") REFERENCES public.organization(id);

ALTER TABLE ONLY public.organization_integrations_integration
    ADD CONSTRAINT "FK_8031a218fc98f33b1f7e4a5ae27" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.repository_cache
    ADD CONSTRAINT "FK_80730191d462c7a9dd72b6b3c4f" FOREIGN KEY ("integrationId") REFERENCES public.integration(id);

ALTER TABLE ONLY public.organization_owners_user
    ADD CONSTRAINT "FK_88b667e5dae95396b7204367e80" FOREIGN KEY ("userId") REFERENCES public."user"(id);

ALTER TABLE ONLY public.policy_analyses_analysis
    ADD CONSTRAINT "FK_90093d0834ea74459c93278d1be" FOREIGN KEY ("analysisId") REFERENCES public.analysis(id);

ALTER TABLE ONLY public.organization_owners_user
    ADD CONSTRAINT "FK_901f7fff05911c8f8a70ad43032" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.organization_notifications_notification
    ADD CONSTRAINT "FK_9d6c46508f2fe2646c79e260ca8" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.analysis
    ADD CONSTRAINT "FK_a4a8de4720688b3b6acaac1b71b" FOREIGN KEY ("analyzerId") REFERENCES public.analyzer(id);

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "FK_a64608a253f14da7ba2a6b96a7c" FOREIGN KEY (default_org) REFERENCES public.organization(id);

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT "FK_acdbd1e490930af04b4ff569ca9" FOREIGN KEY ("createdById") REFERENCES public."user"(id);

ALTER TABLE ONLY public.project
    ADD CONSTRAINT "FK_cfed2edf0775ca6190bf1d303f7" FOREIGN KEY ("integrationId") REFERENCES public.integration(id);

ALTER TABLE ONLY public.organization_policies_policy
    ADD CONSTRAINT "FK_d0233589b7e4fb44d94f913fe29" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.organization_policies_policy
    ADD CONSTRAINT "FK_d498b6d647ffbea1335926fb529" FOREIGN KEY ("policyId") REFERENCES public.policy(id);

ALTER TABLE ONLY public.policy
    ADD CONSTRAINT "FK_e2a559dc71c48a5f3514b2e91c3" FOREIGN KEY ("createdById") REFERENCES public."user"(id);

ALTER TABLE ONLY public.organization_invited_user
    ADD CONSTRAINT "FK_e47975a1141febe29f0fcd6ae93" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.integration
    ADD CONSTRAINT "FK_e9ec70d1a8888315f1315184b75" FOREIGN KEY ("repositoryCacheId") REFERENCES public.repository_cache(id);

ALTER TABLE ONLY public.integration
    ADD CONSTRAINT "FK_f470dfd06183e7bfa12e4ed7d51" FOREIGN KEY ("ownerId") REFERENCES public."user"(id);

ALTER TABLE ONLY public.organization_integrations_integration
    ADD CONSTRAINT "FK_fe96bdf9bb90fadbf29b26eaea8" FOREIGN KEY ("integrationId") REFERENCES public.integration(id);
