import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAnalyzerPluginNames1754764000000 implements MigrationInterface {
    name = 'UpdateAnalyzerPluginNames1754764000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update analyzer configurations to use new generic plugin names
        // This updates the 'steps' JSONB field in the analyzer table

        // Update js-sbom to include both js-sbom and php-sbom plugins
        await queryRunner.query(`
            UPDATE "analyzer" 
            SET "steps" = jsonb_set(
                jsonb_set(
                    "steps",
                    '{0}', 
                    '[
                        {
                            "name": "js-sbom", 
                            "config": {
                                "branch": {
                                    "name": "branch", 
                                    "type": "string", 
                                    "required": true, 
                                    "description": "The branch you want to analyze"
                                }, 
                                "commit_id": {
                                    "name": "commit_id", 
                                    "type": "string", 
                                    "required": false, 
                                    "description": "An optional commit id to analyze"
                                }
                            }, 
                            "version": "v0.0.15-alpha"
                        },
                        {
                            "name": "php-sbom", 
                            "config": {
                                "branch": {
                                    "name": "branch", 
                                    "type": "string", 
                                    "required": true, 
                                    "description": "The branch you want to analyze"
                                }, 
                                "commit_id": {
                                    "name": "commit_id", 
                                    "type": "string", 
                                    "required": false, 
                                    "description": "An optional commit id to analyze"
                                }
                            }, 
                            "version": "v0.0.1-alpha"
                        }
                    ]'::jsonb
                ),
                '{1}', 
                '[
                    {
                        "name": "vuln-finder", 
                        "config": {}, 
                        "version": "v0.0.11-alpha"
                    }, 
                    {
                        "name": "license-finder", 
                        "config": {
                            "licensePolicy": {
                                "name": "License Policy", 
                                "type": "Array<string>", 
                                "required": true, 
                                "description": "A list of licenses that are disallowed in the project"
                            }
                        }, 
                        "version": "v0.0.8-alpha"
                    }
                ]'::jsonb
            )
            WHERE "steps"::text LIKE '%js-vuln-finder%' 
               OR "steps"::text LIKE '%js-license%'
               OR "steps"::text LIKE '%js-sbom%'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert to old plugin names
        await queryRunner.query(`
            UPDATE "analyzer" 
            SET "steps" = jsonb_set(
                jsonb_set(
                    "steps",
                    '{0}', 
                    '[
                        {
                            "name": "js-sbom", 
                            "config": {
                                "branch": {
                                    "name": "branch", 
                                    "type": "string", 
                                    "required": true, 
                                    "description": "The branch you want to analyze"
                                }, 
                                "commit_id": {
                                    "name": "commit_id", 
                                    "type": "string", 
                                    "required": false, 
                                    "description": "An optional commit id to analyze"
                                }
                            }, 
                            "version": "v0.0.15-alpha"
                        }
                    ]'::jsonb
                ),
                '{1}', 
                '[
                    {
                        "name": "js-vuln-finder", 
                        "config": {}, 
                        "version": "v0.0.11-alpha"
                    }, 
                    {
                        "name": "js-license", 
                        "config": {
                            "licensePolicy": {
                                "name": "License Policy", 
                                "type": "Array<string>", 
                                "required": true, 
                                "description": "A list of licenses that are disallowed in the project"
                            }
                        }, 
                        "version": "v0.0.8-alpha"
                    }
                ]'::jsonb
            )
            WHERE "steps"::text LIKE '%vuln-finder%' 
               OR "steps"::text LIKE '%license-finder%' 
               OR "steps"::text LIKE '%php-sbom%'
        `);
    }
}
