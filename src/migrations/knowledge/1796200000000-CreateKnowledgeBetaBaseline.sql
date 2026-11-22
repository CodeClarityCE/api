-- The knowledge schema of a fresh v0.0.57-alpha install, which the beta baseline builds on an empty database.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TABLE "cwe" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "cwe_id_not_null" NOT NULL,
  "cwe_id" character varying CONSTRAINT "cwe_cwe_id_not_null" NOT NULL,
  "name" character varying,
  "abstraction" character varying,
  "structure" character varying,
  "status" character varying,
  "description" character varying,
  "extended_description" character varying,
  "likelihood_of_exploit" character varying,
  "related_weaknesses" jsonb,
  "modes_of_introduction" jsonb,
  "common_consequences" jsonb,
  "detection_methods" jsonb,
  "potential_mitigations" jsonb,
  "taxonomy_mappings" jsonb,
  "observed_examples" jsonb,
  "alternate_terms" jsonb,
  "affected_resources" jsonb,
  "functional_areas" jsonb,
  "categories" jsonb,
  "applicable_platforms" jsonb
);

CREATE TABLE "epss" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "epss_id_not_null" NOT NULL,
  "cve" character varying CONSTRAINT "epss_cve_not_null" NOT NULL,
  "score" double precision,
  "percentile" double precision,
  "score_date" date
);

CREATE TABLE "friends_of_php" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "friends_of_php_id_not_null" NOT NULL,
  "advisory_id" character varying CONSTRAINT "friends_of_php_advisory_id_not_null" NOT NULL,
  "title" character varying CONSTRAINT "friends_of_php_title_not_null" NOT NULL,
  "cve" character varying,
  "link" character varying CONSTRAINT "friends_of_php_link_not_null" NOT NULL,
  "reference" character varying CONSTRAINT "friends_of_php_reference_not_null" NOT NULL,
  "composer" character varying,
  "description" text,
  "branches" jsonb DEFAULT '{}'::jsonb CONSTRAINT "friends_of_php_branches_not_null" NOT NULL,
  "published" timestamp with time zone,
  "modified" timestamp with time zone,
  "retired_reason" character varying,
  "retired_at" timestamp with time zone,
  "origin" character varying GENERATED ALWAYS AS (
CASE
    WHEN (((reference)::text ~~ 'GHSA-%'::text) OR ((link)::text ~ '/advisories/GHSA-'::text)) THEN 'ghsa'::text
    WHEN (((advisory_id)::text ~~ 'PKSA-%'::text) AND ((reference)::text !~ '^[^/]+/[^/]+/[^/]+$'::text)) THEN 'packagist'::text
    ELSE 'friendsofphp'::text
END) STORED
);

CREATE TABLE "gcve" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "gcve_id_not_null" NOT NULL,
  "gcve_id" character varying CONSTRAINT "gcve_gcve_id_not_null" NOT NULL,
  "cve_id" character varying,
  "data_version" character varying,
  "state" character varying,
  "date_published" timestamp with time zone,
  "date_updated" timestamp with time zone,
  "assigner_org_id" character varying,
  "descriptions" jsonb DEFAULT '[]'::jsonb,
  "affected" jsonb DEFAULT '[]'::jsonb,
  "affected_flattened" jsonb DEFAULT '[]'::jsonb,
  "metrics" jsonb DEFAULT '[]'::jsonb,
  "problem_types" jsonb DEFAULT '[]'::jsonb,
  "references" jsonb DEFAULT '[]'::jsonb,
  "adp_enrichments" jsonb DEFAULT '[]'::jsonb,
  "cwes" text[] DEFAULT '{}'::text[],
  "vlai_score" character varying DEFAULT ''::character varying,
  "vlai_confidence" double precision DEFAULT 0,
  "retired_reason" character varying,
  "retired_at" timestamp with time zone,
  "origin" character varying GENERATED ALWAYS AS (
CASE
    WHEN ((gcve_id)::text ~~ 'GCVE-0-%'::text) THEN 'cve-list'::text
    ELSE 'gcve'::text
END) STORED
);

CREATE TABLE "kev" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "kev_id_not_null" NOT NULL,
  "cve" character varying CONSTRAINT "kev_cve_not_null" NOT NULL,
  "vendor_project" character varying,
  "product" character varying,
  "vulnerability_name" character varying,
  "date_added" date CONSTRAINT "kev_date_added_not_null" NOT NULL,
  "due_date" date,
  "short_description" text,
  "required_action" text,
  "notes" text,
  "known_ransomware_use" boolean DEFAULT false CONSTRAINT "kev_known_ransomware_use_not_null" NOT NULL,
  "cwes" jsonb DEFAULT '[]'::jsonb CONSTRAINT "kev_cwes_not_null" NOT NULL
);

CREATE TABLE "knowledge_date_conversion_issue" (
  "source_table" character varying CONSTRAINT "knowledge_date_conversion_issue_source_table_not_null" NOT NULL,
  "record_id" uuid CONSTRAINT "knowledge_date_conversion_issue_record_id_not_null" NOT NULL,
  "column_name" character varying CONSTRAINT "knowledge_date_conversion_issue_column_name_not_null" NOT NULL,
  "raw_value" text CONSTRAINT "knowledge_date_conversion_issue_raw_value_not_null" NOT NULL,
  "reported_at" timestamp with time zone DEFAULT now() CONSTRAINT "knowledge_date_conversion_issue_reported_at_not_null" NOT NULL
);

CREATE TABLE "knowledge_dated_restore" (
  "id" boolean DEFAULT true CONSTRAINT "knowledge_dated_restore_id_not_null" NOT NULL,
  "label" character varying CONSTRAINT "knowledge_dated_restore_label_not_null" NOT NULL,
  "marked_at" timestamp with time zone DEFAULT now() CONSTRAINT "knowledge_dated_restore_marked_at_not_null" NOT NULL
);

CREATE TABLE "knowledge_source_sync" (
  "source" character varying CONSTRAINT "knowledge_source_sync_source_not_null" NOT NULL,
  "watermark" timestamp with time zone,
  "last_run_started_at" timestamp with time zone,
  "last_run_finished_at" timestamp with time zone,
  "last_outcome" character varying,
  "last_error" text,
  "row_count" bigint DEFAULT 0 CONSTRAINT "knowledge_source_sync_row_count_not_null" NOT NULL,
  "bulk_completed_at" timestamp with time zone,
  "validated_row_count" bigint,
  "validated_malicious_count" bigint,
  "validated_at" timestamp with time zone,
  "validation_error" text,
  "upstream_total" bigint
);

CREATE TABLE "licenses" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "licenses_id_not_null" NOT NULL,
  "name" character varying(250),
  "reference" character varying(250),
  "isDeprecatedLicenseId" boolean,
  "detailsUrl" character varying,
  "referenceNumber" integer,
  "licenseId" character varying,
  "seeAlso" text,
  "isOsiApproved" boolean,
  "details" jsonb
);

CREATE TABLE "nvd" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "nvd_id_not_null" NOT NULL,
  "nvd_id" character varying CONSTRAINT "nvd_nvd_id_not_null" NOT NULL,
  "sourceIdentifier" character varying,
  "published" timestamp with time zone,
  "lastModified" timestamp with time zone,
  "vulnStatus" character varying,
  "descriptions" jsonb,
  "metrics" jsonb,
  "weaknesses" jsonb,
  "configurations" jsonb,
  "affectedFlattened" jsonb,
  "affected" jsonb,
  "references" jsonb,
  "vlai_score" character varying,
  "vlai_confidence" double precision,
  "retired_reason" character varying,
  "retired_at" timestamp with time zone,
  "origin" character varying GENERATED ALWAYS AS ('cve-list'::character varying) STORED
);

CREATE TABLE "osv" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "osv_id_not_null" NOT NULL,
  "osv_id" character varying CONSTRAINT "osv_osv_id_not_null" NOT NULL,
  "schema_version" character varying,
  "modified" timestamp with time zone,
  "published" timestamp with time zone,
  "withdrawn" timestamp with time zone,
  "summary" character varying,
  "details" character varying,
  "cve" character varying,
  "aliases" jsonb,
  "related" jsonb,
  "severity" jsonb,
  "affected" jsonb,
  "references" jsonb,
  "credits" jsonb,
  "database_specific" jsonb,
  "cwes" jsonb,
  "vlai_score" character varying,
  "vlai_confidence" double precision,
  "retired_reason" character varying,
  "retired_at" timestamp with time zone,
  "kind" character varying DEFAULT 'vulnerability'::character varying CONSTRAINT "osv_kind_not_null" NOT NULL,
  "cve_aliases" jsonb GENERATED ALWAYS AS (COALESCE(jsonb_path_query_array(aliases, '$[*]?(@ starts with "CVE-")'::jsonpath), '[]'::jsonb)) STORED,
  "origin" character varying GENERATED ALWAYS AS (
CASE
    WHEN (split_part((osv_id)::text, '-'::text, 1) = 'CVE'::text) THEN 'cve-list'::text
    WHEN ((split_part((osv_id)::text, '-'::text, 1) = 'GHSA'::text) AND (jsonb_typeof("references") = 'array'::text) AND jsonb_path_exists("references", '$[*]."url"?(@ like_regex "github[.]com/FriendsOfPHP/security-advisories/")'::jsonpath)) THEN 'friendsofphp'::text
    ELSE lower(split_part((osv_id)::text, '-'::text, 1))
END) STORED
);

CREATE TABLE "package" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "package_id_not_null" NOT NULL,
  "name" character varying(255) CONSTRAINT "package_name_not_null" NOT NULL,
  "description" character varying(255),
  "homepage" character varying(255),
  "latest_version" character varying(255) CONSTRAINT "package_latest_version_not_null" NOT NULL,
  "time" timestamp with time zone,
  "keywords" text,
  "source" jsonb,
  "license" text,
  "licenses" jsonb,
  "extra" jsonb,
  "language" character varying(50) DEFAULT 'javascript'::character varying CONSTRAINT "package_language_not_null" NOT NULL
);

CREATE TABLE "package_vulnerability" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "package_vulnerability_id_not_null" NOT NULL,
  "package_name" character varying CONSTRAINT "package_vulnerability_package_name_not_null" NOT NULL,
  "package_ecosystem" character varying CONSTRAINT "package_vulnerability_package_ecosystem_not_null" NOT NULL,
  "osv_id" uuid,
  "nvd_id" uuid,
  "friendsofphp_id" uuid,
  "created_at" timestamp without time zone DEFAULT now() CONSTRAINT "package_vulnerability_created_at_not_null" NOT NULL,
  "gcve_id" uuid
);

CREATE TABLE "version" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "version_id_not_null" NOT NULL,
  "package_id" uuid CONSTRAINT "version_package_id_not_null" NOT NULL,
  "version" character varying(255) CONSTRAINT "version_version_not_null" NOT NULL,
  "dependencies" jsonb,
  "dev_dependencies" jsonb,
  "extra" jsonb,
  "created_at" timestamp with time zone DEFAULT now() CONSTRAINT "version_created_at_not_null" NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() CONSTRAINT "version_updated_at_not_null" NOT NULL
);

ALTER TABLE "cwe" ADD CONSTRAINT "PK_da4d150c7412f06c7ee5fee61df" PRIMARY KEY (id);

ALTER TABLE "epss" ADD CONSTRAINT "PK_3849ad9c24a83f52032bdd766d6" PRIMARY KEY (id);

ALTER TABLE "friends_of_php" ADD CONSTRAINT "CHK_friends_of_php_retired_reason" CHECK ("retired_reason" IN ('rejected', 'withdrawn', 'removed'));

ALTER TABLE "friends_of_php" ADD CONSTRAINT "CHK_friends_of_php_retired_together" CHECK (((retired_reason IS NULL) = (retired_at IS NULL)));

ALTER TABLE "friends_of_php" ADD CONSTRAINT "PK_friends_of_php" PRIMARY KEY (id);

ALTER TABLE "friends_of_php" ADD CONSTRAINT "UQ_friends_of_php_advisory_id" UNIQUE (advisory_id);

ALTER TABLE "gcve" ADD CONSTRAINT "CHK_gcve_retired_reason" CHECK ("retired_reason" IN ('rejected', 'withdrawn', 'removed'));

ALTER TABLE "gcve" ADD CONSTRAINT "CHK_gcve_retired_together" CHECK (((retired_reason IS NULL) = (retired_at IS NULL)));

ALTER TABLE "gcve" ADD CONSTRAINT "PK_gcve" PRIMARY KEY (id);

ALTER TABLE "gcve" ADD CONSTRAINT "UQ_gcve_gcve_id" UNIQUE (gcve_id);

ALTER TABLE "kev" ADD CONSTRAINT "PK_kev" PRIMARY KEY (id);

ALTER TABLE "kev" ADD CONSTRAINT "UQ_kev_cve" UNIQUE (cve);

ALTER TABLE "knowledge_dated_restore" ADD CONSTRAINT "knowledge_dated_restore_id_check" CHECK (id);

ALTER TABLE "knowledge_dated_restore" ADD CONSTRAINT "knowledge_dated_restore_pkey" PRIMARY KEY (id);

ALTER TABLE "knowledge_source_sync" ADD CONSTRAINT "CHK_knowledge_source_sync_last_outcome" CHECK ("last_outcome" IN ('success', 'failure'));

ALTER TABLE "knowledge_source_sync" ADD CONSTRAINT "PK_knowledge_source_sync" PRIMARY KEY (source);

ALTER TABLE "licenses" ADD CONSTRAINT "PK_da5021501ce80efa03de6f40086" PRIMARY KEY (id);

ALTER TABLE "nvd" ADD CONSTRAINT "CHK_nvd_retired_reason" CHECK ("retired_reason" IN ('rejected', 'withdrawn', 'removed'));

ALTER TABLE "nvd" ADD CONSTRAINT "CHK_nvd_retired_together" CHECK (((retired_reason IS NULL) = (retired_at IS NULL)));

ALTER TABLE "nvd" ADD CONSTRAINT "PK_843fa8d16ab777718211ba39ea6" PRIMARY KEY (id);

ALTER TABLE "osv" ADD CONSTRAINT "CHK_osv_kind" CHECK ("kind" IN ('vulnerability', 'malicious'));

ALTER TABLE "osv" ADD CONSTRAINT "CHK_osv_retired_reason" CHECK ("retired_reason" IN ('rejected', 'withdrawn', 'removed'));

ALTER TABLE "osv" ADD CONSTRAINT "CHK_osv_retired_together" CHECK (((retired_reason IS NULL) = (retired_at IS NULL)));

ALTER TABLE "osv" ADD CONSTRAINT "PK_f8e9d331bbbcee401c05ec8481e" PRIMARY KEY (id);

ALTER TABLE "package" ADD CONSTRAINT "PK_308364c66df656295bc4ec467c2" PRIMARY KEY (id);

ALTER TABLE "package_vulnerability" ADD CONSTRAINT "CHK_package_vulnerability_one_fk" CHECK (((((((osv_id IS NOT NULL))::integer + ((nvd_id IS NOT NULL))::integer) + ((friendsofphp_id IS NOT NULL))::integer) + ((gcve_id IS NOT NULL))::integer) = 1));

ALTER TABLE "package_vulnerability" ADD CONSTRAINT "PK_package_vulnerability" PRIMARY KEY (id);

ALTER TABLE "version" ADD CONSTRAINT "PK_version_id" PRIMARY KEY (id);

ALTER TABLE "package_vulnerability" ADD CONSTRAINT "FK_package_vulnerability_friendsofphp" FOREIGN KEY (friendsofphp_id) REFERENCES friends_of_php(id) ON DELETE CASCADE;

ALTER TABLE "package_vulnerability" ADD CONSTRAINT "FK_package_vulnerability_gcve" FOREIGN KEY (gcve_id) REFERENCES gcve(id) ON DELETE CASCADE;

ALTER TABLE "package_vulnerability" ADD CONSTRAINT "FK_package_vulnerability_nvd" FOREIGN KEY (nvd_id) REFERENCES nvd(id) ON DELETE CASCADE;

ALTER TABLE "package_vulnerability" ADD CONSTRAINT "FK_package_vulnerability_osv" FOREIGN KEY (osv_id) REFERENCES osv(id) ON DELETE CASCADE;

ALTER TABLE "version" ADD CONSTRAINT "FK_version_package" FOREIGN KEY (package_id) REFERENCES package(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX "IDX_129e04e01810e12ea16e48b275" ON public.cwe USING btree (cwe_id);

CREATE UNIQUE INDEX "IDX_9cc3075a662b00d9b3b6d1590f" ON public.epss USING btree (cve);

CREATE INDEX "IDX_friends_of_php_branches_gin" ON public.friends_of_php USING gin (branches);

CREATE INDEX "IDX_friends_of_php_composer" ON public.friends_of_php USING btree (composer);

CREATE INDEX "IDX_friends_of_php_cve" ON public.friends_of_php USING btree (cve);

CREATE INDEX "IDX_friends_of_php_published" ON public.friends_of_php USING btree (published);

CREATE INDEX idx_friends_of_php_advisory_id ON public.friends_of_php USING btree (advisory_id);

CREATE INDEX idx_friends_of_php_composer ON public.friends_of_php USING btree (composer);

CREATE INDEX "IDX_gcve_cve_id" ON public.gcve USING btree (cve_id) WHERE (cve_id IS NOT NULL);

CREATE INDEX "IDX_gcve_state" ON public.gcve USING btree (state);

CREATE INDEX gcve_affected_flattened_gin_pathops_idx ON public.gcve USING gin (affected_flattened jsonb_path_ops);

CREATE UNIQUE INDEX "IDX_d48c4e23bf4cc989ccc9598b39" ON public.licenses USING btree ("licenseId");

CREATE INDEX idx_license_name ON public.licenses USING btree (name);

CREATE UNIQUE INDEX "IDX_ff27e0c5a71cd3d2b6623d4631" ON public.nvd USING btree (nvd_id);

CREATE INDEX "IDX_nvd_descriptions_text_search" ON public.nvd USING gin (to_tsvector('english'::regconfig, (descriptions)::text));

CREATE INDEX "IDX_nvd_nvd_id_text_search" ON public.nvd USING gin (to_tsvector('english'::regconfig, (nvd_id)::text));

CREATE INDEX "IDX_nvd_nvd_id_upper" ON public.nvd USING btree (upper((nvd_id)::text));

CREATE INDEX idx_nvd_affected_product ON public.nvd USING gin (affected);

CREATE INDEX nvd_affectedflattened_gin_pathops_idx ON public.nvd USING gin ("affectedFlattened" jsonb_path_ops);

CREATE UNIQUE INDEX "IDX_a1a455434143cac56134910e0b" ON public.osv USING btree (osv_id);

CREATE INDEX "IDX_osv_aliases_gin" ON public.osv USING gin (aliases);

CREATE INDEX "IDX_osv_aliases_not_null" ON public.osv USING btree (aliases) WHERE (aliases IS NOT NULL);

CREATE INDEX "IDX_osv_cve_aliases_gin" ON public.osv USING gin (cve_aliases);

CREATE INDEX "IDX_osv_osv_id_upper" ON public.osv USING btree (upper((osv_id)::text));

CREATE INDEX "IDX_osv_summary_text_search" ON public.osv USING gin (to_tsvector('english'::regconfig, (summary)::text));

CREATE INDEX idx_osv_affected_purl_composer ON public.osv USING gin (affected);

CREATE INDEX idx_osv_composer_packages ON public.osv USING gin (affected) WHERE ((affected)::text ~~ '%pkg:composer/%'::text);

CREATE INDEX osv_affected_gin_pathops_idx ON public.osv USING gin (affected jsonb_path_ops);

CREATE INDEX "IDX_package_language" ON public.package USING btree (language);

CREATE UNIQUE INDEX "IDX_package_name_language" ON public.package USING btree (name, language);

CREATE INDEX "IDX_pv_friendsofphp_id" ON public.package_vulnerability USING btree (friendsofphp_id) WHERE (friendsofphp_id IS NOT NULL);

CREATE INDEX "IDX_pv_gcve_id" ON public.package_vulnerability USING btree (gcve_id) WHERE (gcve_id IS NOT NULL);

CREATE INDEX "IDX_pv_nvd_id" ON public.package_vulnerability USING btree (nvd_id) WHERE (nvd_id IS NOT NULL);

CREATE INDEX "IDX_pv_osv_id" ON public.package_vulnerability USING btree (osv_id) WHERE (osv_id IS NOT NULL);

CREATE INDEX "IDX_pv_package_ecosystem" ON public.package_vulnerability USING btree (package_ecosystem);

CREATE INDEX "IDX_pv_package_name" ON public.package_vulnerability USING btree (package_name);

CREATE INDEX "IDX_pv_package_name_ecosystem" ON public.package_vulnerability USING btree (package_name, package_ecosystem);

CREATE UNIQUE INDEX "IDX_pv_unique_friendsofphp" ON public.package_vulnerability USING btree (package_name, package_ecosystem, friendsofphp_id) WHERE (friendsofphp_id IS NOT NULL);

CREATE UNIQUE INDEX "IDX_pv_unique_gcve" ON public.package_vulnerability USING btree (package_name, package_ecosystem, gcve_id) WHERE (gcve_id IS NOT NULL);

CREATE UNIQUE INDEX "IDX_pv_unique_nvd" ON public.package_vulnerability USING btree (package_name, package_ecosystem, nvd_id) WHERE (nvd_id IS NOT NULL);

CREATE UNIQUE INDEX "IDX_pv_unique_osv" ON public.package_vulnerability USING btree (package_name, package_ecosystem, osv_id) WHERE (osv_id IS NOT NULL);

CREATE INDEX "IDX_version_dependencies_gin" ON public.version USING gin (dependencies);

CREATE INDEX "IDX_version_extra_gin" ON public.version USING gin (extra);

CREATE INDEX "IDX_version_package_id" ON public.version USING btree (package_id);

CREATE UNIQUE INDEX "IDX_version_unique" ON public.version USING btree (package_id, version);

CREATE INDEX "IDX_version_version" ON public.version USING btree (version);

INSERT INTO "knowledge_source_sync" ("source") VALUES ('cwe');

INSERT INTO "knowledge_source_sync" ("source") VALUES ('epss');

INSERT INTO "knowledge_source_sync" ("source") VALUES ('friends_of_php');

INSERT INTO "knowledge_source_sync" ("source") VALUES ('gcve');

INSERT INTO "knowledge_source_sync" ("source") VALUES ('licenses');

INSERT INTO "knowledge_source_sync" ("source") VALUES ('nvd');

INSERT INTO "knowledge_source_sync" ("source") VALUES ('osv');

INSERT INTO "knowledge_source_sync" ("source") VALUES ('kev');
