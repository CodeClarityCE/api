-- The plugins schema of a fresh v0.0.57-alpha install, which the beta baseline builds on an empty database.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TABLE "plugin" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "plugin_id_not_null" NOT NULL,
  "name" character varying,
  "version" character varying,
  "description" character varying,
  "depends_on" jsonb,
  "config" jsonb
);

ALTER TABLE "plugin" ADD CONSTRAINT "PK_26c98f1bfcce9906f8bb0b11e5b" PRIMARY KEY (id);

ALTER TABLE "plugin" ADD CONSTRAINT "UQ_plugin_name" UNIQUE (name);
