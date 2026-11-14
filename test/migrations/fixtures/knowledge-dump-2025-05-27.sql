-- Schema of deployment/dump/knowledge.dump (archive created 2025-05-27 09:12:30 UTC, pg_dump 17.5),
-- taken from its table of contents. Same as pg_restore --schema-only without owners.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';

CREATE TABLE public.cwe (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    cwe_id character varying NOT NULL,
    name character varying,
    abstraction character varying,
    structure character varying,
    status character varying,
    description character varying,
    extended_description character varying,
    likelihood_of_exploit character varying,
    related_weaknesses jsonb,
    modes_of_introduction jsonb,
    common_consequences jsonb,
    detection_methods jsonb,
    potential_mitigations jsonb,
    taxonomy_mappings jsonb,
    observed_examples jsonb,
    alternate_terms jsonb,
    affected_resources jsonb,
    functional_areas jsonb,
    categories jsonb,
    applicable_platforms jsonb
);

CREATE TABLE public.js_version (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    version character varying(255) NOT NULL,
    dependencies jsonb,
    dev_dependencies jsonb,
    extra jsonb,
    "packageId" uuid
);

CREATE TABLE public.licenses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(250),
    reference character varying(250),
    "isDeprecatedLicenseId" boolean,
    "detailsUrl" character varying,
    "referenceNumber" integer,
    "licenseId" character varying,
    "seeAlso" text,
    "isOsiApproved" boolean,
    details jsonb
);

CREATE TABLE public.nvd (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nvd_id character varying NOT NULL,
    "sourceIdentifier" character varying,
    published character varying,
    "lastModified" character varying,
    "vulnStatus" character varying,
    descriptions jsonb,
    metrics jsonb,
    weaknesses jsonb,
    configurations jsonb,
    "affectedFlattened" jsonb,
    affected jsonb,
    "references" jsonb
);

CREATE TABLE public.osv (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    osv_id character varying NOT NULL,
    schema_version character varying,
    modified character varying,
    published character varying,
    withdrawn character varying,
    summary character varying,
    details character varying,
    cve character varying,
    aliases jsonb,
    related jsonb,
    severity jsonb,
    affected jsonb,
    "references" jsonb,
    credits jsonb,
    database_specific jsonb,
    cwes jsonb
);

CREATE TABLE public.package (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(255),
    homepage character varying(255),
    latest_version character varying(255) NOT NULL,
    "time" timestamp with time zone,
    keywords text,
    source jsonb,
    license character varying(50),
    licenses jsonb,
    extra jsonb
);

ALTER TABLE ONLY public.package
    ADD CONSTRAINT "PK_308364c66df656295bc4ec467c2" PRIMARY KEY (id);

ALTER TABLE ONLY public.js_version
    ADD CONSTRAINT "PK_48f51bbe5c448d86db28db71f12" PRIMARY KEY (id);

ALTER TABLE ONLY public.nvd
    ADD CONSTRAINT "PK_843fa8d16ab777718211ba39ea6" PRIMARY KEY (id);

ALTER TABLE ONLY public.cwe
    ADD CONSTRAINT "PK_da4d150c7412f06c7ee5fee61df" PRIMARY KEY (id);

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT "PK_da5021501ce80efa03de6f40086" PRIMARY KEY (id);

ALTER TABLE ONLY public.osv
    ADD CONSTRAINT "PK_f8e9d331bbbcee401c05ec8481e" PRIMARY KEY (id);

CREATE UNIQUE INDEX "IDX_129e04e01810e12ea16e48b275" ON public.cwe USING btree (cwe_id);

CREATE UNIQUE INDEX "IDX_a1a455434143cac56134910e0b" ON public.osv USING btree (osv_id);

CREATE UNIQUE INDEX "IDX_b23e12326a4218d09bd72301aa" ON public.package USING btree (name);

CREATE UNIQUE INDEX "IDX_d48c4e23bf4cc989ccc9598b39" ON public.licenses USING btree ("licenseId");

CREATE UNIQUE INDEX "IDX_ff27e0c5a71cd3d2b6623d4631" ON public.nvd USING btree (nvd_id);

CREATE INDEX idx_js_version_version ON public.js_version USING btree (version);

CREATE INDEX idx_license_name ON public.licenses USING btree (name);

ALTER TABLE ONLY public.js_version
    ADD CONSTRAINT "FK_db3d7c4b2252809ded17121804e" FOREIGN KEY ("packageId") REFERENCES public.package(id);
