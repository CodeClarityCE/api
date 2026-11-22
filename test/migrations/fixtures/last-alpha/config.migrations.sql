-- The migrations table of a fresh last alpha install (snapshot-last-alpha.ts).
CREATE TABLE "migrations" ("id" SERIAL NOT NULL, "timestamp" bigint NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id"));
INSERT INTO "migrations" ("timestamp", "name") VALUES
  (1754600000000, 'CreateConfigBaseline1754600000000'),
  (1770200000000, 'AddGcveLastToConfig1770200000000'),
  (1785829532189, 'AddOsvLastToConfig1785829532189'),
  (1795651200000, 'AddKevLastToConfig1795651200000');
