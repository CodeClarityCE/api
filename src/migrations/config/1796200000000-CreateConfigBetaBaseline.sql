-- The config schema of a fresh v0.0.57-alpha install, which the beta baseline builds on an empty database.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TABLE "config" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "config_id_not_null" NOT NULL,
  "nvd_last" timestamp with time zone,
  "npm_last" character varying,
  "gcve_last" timestamp with time zone,
  "osv_last" timestamp with time zone,
  "kev_last" timestamp with time zone
);

ALTER TABLE "config" ADD CONSTRAINT "config_pkey" PRIMARY KEY (id);

INSERT INTO "config" DEFAULT VALUES;
