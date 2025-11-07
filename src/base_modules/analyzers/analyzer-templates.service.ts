import { Injectable } from '@nestjs/common';
import { Stage } from './analyzer.types';

export interface AnalyzerTemplate {
    name: string;
    description: string;
    supported_languages: string[];
    language_config: Record<string, { plugins: string[] }>;
    logo: string;
    steps: Stage[][];
}

@Injectable()
export class AnalyzerTemplatesService {
    /**
     * Get all available analyzer templates
     */
    getTemplates(): AnalyzerTemplate[] {
        return [
            this.getJavaScriptTemplate(),
            this.getPHPTemplate(),
            this.getMultiLanguageTemplate()
        ];
    }

    /**
     * Get template by language
     */
    getTemplateByLanguage(language: string): AnalyzerTemplate {
        switch (language.toLowerCase()) {
            case 'javascript':
            case 'js':
                return this.getJavaScriptTemplate();
            case 'php':
                return this.getPHPTemplate();
            case 'multi':
            case 'multilanguage':
                return this.getMultiLanguageTemplate();
            default:
                throw new Error(`No template available for language: ${language}`);
        }
    }

    /**
     * JavaScript-only analyzer template
     */
    private getJavaScriptTemplate(): AnalyzerTemplate {
        return {
            name: 'JavaScript Analyzer',
            description:
                'Analyzes JavaScript and Node.js projects for dependencies, vulnerabilities, and license compliance',
            supported_languages: ['javascript'],
            language_config: {
                javascript: {
                    plugins: ['js-sbom', 'vuln-finder', 'license-finder']
                }
            },
            logo: 'js',
            steps: [
                [
                    {
                        name: 'js-sbom',
                        version: 'v0.0.15-alpha',
                        config: {
                            branch: {
                                name: 'branch',
                                type: 'string',
                                required: true,
                                description: 'The branch you want to analyze'
                            },
                            commit_id: {
                                name: 'commit_id',
                                type: 'string',
                                required: false,
                                description: 'An optional commit id to analyze'
                            }
                        },
                        persistant_config: {}
                    }
                ],
                [
                    {
                        name: 'vuln-finder',
                        version: 'v0.0.11-alpha',
                        config: {},
                        persistant_config: {}
                    },
                    {
                        name: 'license-finder',
                        version: 'v0.0.8-alpha',
                        config: {
                            licensePolicy: {
                                name: 'License Policy',
                                type: 'Array<string>',
                                required: true,
                                description: 'A list of licenses that are disallowed in the project'
                            }
                        },
                        persistant_config: {}
                    }
                ]
            ]
        };
    }

    /**
     * PHP-only analyzer template
     */
    private getPHPTemplate(): AnalyzerTemplate {
        return {
            name: 'PHP Analyzer',
            description:
                'Analyzes PHP projects for dependencies, vulnerabilities, and license compliance using Composer',
            supported_languages: ['php'],
            language_config: {
                php: {
                    plugins: ['php-sbom', 'vuln-finder', 'license-finder']
                }
            },
            logo: 'php',
            steps: [
                [
                    {
                        name: 'php-sbom',
                        version: 'v0.0.1-alpha',
                        config: {
                            branch: {
                                name: 'branch',
                                type: 'string',
                                required: true,
                                description: 'The branch you want to analyze'
                            },
                            commit_id: {
                                name: 'commit_id',
                                type: 'string',
                                required: false,
                                description: 'An optional commit id to analyze'
                            }
                        },
                        persistant_config: {}
                    }
                ],
                [
                    {
                        name: 'vuln-finder',
                        version: 'v0.0.11-alpha',
                        config: {},
                        persistant_config: {}
                    },
                    {
                        name: 'license-finder',
                        version: 'v0.0.8-alpha',
                        config: {
                            licensePolicy: {
                                name: 'License Policy',
                                type: 'Array<string>',
                                required: true,
                                description: 'A list of licenses that are disallowed in the project'
                            }
                        },
                        persistant_config: {}
                    }
                ]
            ]
        };
    }

    /**
     * Multi-language analyzer template
     */
    private getMultiLanguageTemplate(): AnalyzerTemplate {
        return {
            name: 'Multi-Language Analyzer',
            description:
                'Analyzes JavaScript and PHP projects for dependencies, vulnerabilities, and license compliance',
            supported_languages: ['javascript', 'php'],
            language_config: {
                javascript: {
                    plugins: ['js-sbom', 'vuln-finder', 'license-finder']
                },
                php: {
                    plugins: ['php-sbom', 'vuln-finder', 'license-finder']
                }
            },
            logo: 'multi',
            steps: [
                [
                    {
                        name: 'js-sbom',
                        version: 'v0.0.15-alpha',
                        config: {
                            branch: {
                                name: 'branch',
                                type: 'string',
                                required: true,
                                description: 'The branch you want to analyze'
                            },
                            commit_id: {
                                name: 'commit_id',
                                type: 'string',
                                required: false,
                                description: 'An optional commit id to analyze'
                            }
                        },
                        persistant_config: {}
                    },
                    {
                        name: 'php-sbom',
                        version: 'v0.0.1-alpha',
                        config: {
                            branch: {
                                name: 'branch',
                                type: 'string',
                                required: true,
                                description: 'The branch you want to analyze'
                            },
                            commit_id: {
                                name: 'commit_id',
                                type: 'string',
                                required: false,
                                description: 'An optional commit id to analyze'
                            }
                        },
                        persistant_config: {}
                    }
                ],
                [
                    {
                        name: 'vuln-finder',
                        version: 'v0.0.11-alpha',
                        config: {},
                        persistant_config: {}
                    },
                    {
                        name: 'license-finder',
                        version: 'v0.0.8-alpha',
                        config: {
                            licensePolicy: {
                                name: 'License Policy',
                                type: 'Array<string>',
                                required: true,
                                description: 'A list of licenses that are disallowed in the project'
                            }
                        },
                        persistant_config: {}
                    }
                ]
            ]
        };
    }
}
