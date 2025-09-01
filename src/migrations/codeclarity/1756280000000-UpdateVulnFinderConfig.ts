import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateVulnFinderConfig1756280000000 implements MigrationInterface {
    name = 'UpdateVulnFinderConfig1756280000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update existing analyzers to add vulnerability policy configuration to vuln-finder
        await queryRunner.query(`
            UPDATE "analyzer" 
            SET "steps" = jsonb_set(
                "steps",
                '{1,0,config}',
                '{"vulnerabilityPolicy": {"name": "Vulnerability Policy", "type": "Array<string>", "required": false, "description": "A list of vulnerabilities that are blacklisted in the project"}}'::jsonb
            )
            WHERE ("steps"::text LIKE '%"name": "vuln-finder"%' OR "steps"::text LIKE '%"name": "js-vuln-finder"%')
              AND "steps"::text LIKE '%"config": {}%'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert vuln-finder config back to empty object
        await queryRunner.query(`
            UPDATE "analyzer" 
            SET "steps" = jsonb_set(
                "steps",
                '{1,0,config}',
                '{}'::jsonb
            )
            WHERE ("steps"::text LIKE '%"name": "vuln-finder"%' OR "steps"::text LIKE '%"name": "js-vuln-finder"%')
              AND "steps"::text LIKE '%vulnerabilityPolicy%'
        `);
    }
}
