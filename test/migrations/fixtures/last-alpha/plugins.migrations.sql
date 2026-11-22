-- The migrations table of a fresh last alpha install (snapshot-last-alpha.ts).
CREATE TABLE "migrations" ("id" SERIAL NOT NULL, "timestamp" bigint NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id"));
INSERT INTO "migrations" ("timestamp", "name") VALUES
  (1754648240560, 'Init1754648240560'),
  (1795132800000, 'UniquePluginName1795132800000');
