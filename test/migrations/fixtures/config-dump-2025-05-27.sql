-- Schema of deployment/dump/config.dump (archive created 2025-05-27 09:12:44 UTC, pg_dump 17.5),
-- taken from its table of contents. Same as pg_restore --schema-only without owners.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';

CREATE TABLE public.config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nvd_last timestamp with time zone,
    npm_last character varying
);

ALTER TABLE ONLY public.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (id);

-- Its one data row.
INSERT INTO public.config (id, nvd_last, npm_last) VALUES ('995a7e39-d5bb-4ca0-a60b-ae522f672651', '2025-05-27 09:11:45.222626+00', '0');
