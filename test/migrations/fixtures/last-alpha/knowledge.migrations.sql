-- The migrations table of a fresh last alpha install (snapshot-last-alpha.ts).
CREATE TABLE "migrations" ("id" SERIAL NOT NULL, "timestamp" bigint NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id"));
INSERT INTO "migrations" ("timestamp", "name") VALUES
  (1754600000000, 'CreateKnowledgeBaseline1754600000000'),
  (1754648228805, 'Init1754648228805'),
  (1754758000000, 'AddLanguageAgnosticPackageVersionTables1754758000000'),
  (1754760000000, 'CleanupIncorrectTables1754760000000'),
  (1754762000000, 'DropJsVersionTable1754762000000'),
  (1755451900000, 'CreateFriendsOfPhpTable1755451900000'),
  (1755452000000, 'AddPHPVulnerabilityIndexes1755452000000'),
  (1756296558000, 'AddVulnerabilitySearchIndexes1756296558000'),
  (1757000000000, 'AddVlaiColumns1757000000000'),
  (1757100000000, 'AddEpssTable1757100000000'),
  (1767100000000, 'CreatePackageVulnerabilityWithFKs1767100000000'),
  (1770000000000, 'CreateGcveTable1770000000000'),
  (1770100000000, 'AddGcveToPackageVulnerability1770100000000'),
  (1794182400000, 'CreateKnowledgeSourceSync1794182400000'),
  (1794268800000, 'ExtendKnowledgeSoundTypes1794268800000'),
  (1794355200000, 'AddKnowledgeValidation1794355200000'),
  (1794441600000, 'AddKnowledgeSourceOrigins1794441600000'),
  (1794528000000, 'AddKnowledgeSourceUpstreamTotal1794528000000'),
  (1794614400000, 'AllowMissingFriendsOfPhpDates1794614400000'),
  (1795392000000, 'WidenPackageLicense1795392000000'),
  (1795651200000, 'CreateKevTable1795651200000');
