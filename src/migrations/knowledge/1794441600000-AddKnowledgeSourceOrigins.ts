import { MigrationInterface, QueryRunner } from "typeorm";

// Each advisory's origin: the upstream authority its data derives from.
const ORIGINS: Record<string, string> = {
  nvd: `'cve-list'::varchar`,
  // GNA 0 republishes the CVE list; other GNAs issue their own records.
  gcve: `CASE WHEN "gcve_id" LIKE 'GCVE-0-%' THEN 'cve-list' ELSE 'gcve' END`,
  // OSV aggregates databases named by the id prefix. GitHub advisories that cite a FriendsOfPHP file were imported from it.
  osv: `CASE
    WHEN split_part("osv_id", '-', 1) = 'CVE' THEN 'cve-list'
    WHEN split_part("osv_id", '-', 1) = 'GHSA'
      AND jsonb_typeof("references") = 'array'
      AND jsonb_path_exists("references", '$[*].url ? (@ like_regex "github[.]com/FriendsOfPHP/security-advisories/")')
      THEN 'friendsofphp'
    ELSE lower(split_part("osv_id", '-', 1))
  END`,
  // Repository advisories that link a GitHub advisory copy it. PKSA- rows came from Packagist's API, which names its source in "reference".
  friends_of_php: `CASE
    WHEN "reference" LIKE 'GHSA-%' OR "link" ~ '/advisories/GHSA-' THEN 'ghsa'
    WHEN "advisory_id" LIKE 'PKSA-%' AND "reference" !~ '^[^/]+/[^/]+/[^/]+$' THEN 'packagist'
    ELSE 'friendsofphp'
  END`,
};

export class AddKnowledgeSourceOrigins1794441600000 implements MigrationInterface {
  name = "AddKnowledgeSourceOrigins1794441600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, origin] of Object.entries(ORIGINS)) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "origin" character varying GENERATED ALWAYS AS (${origin}) STORED`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of Object.keys(ORIGINS)) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "origin"`);
    }
  }
}
