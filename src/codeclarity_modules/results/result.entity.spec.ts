import { Analysis } from '../../base_modules/analyses/analysis.entity';
import {
    Result,
    type ResultObject,
    type ResultByAnalysisId,
    type AnalysisInfo
} from './result.entity';

describe('Result Entity', () => {
    let result: Result;

    beforeEach(() => {
        result = new Result();
    });

    it('should create an instance', () => {
        expect(result).toBeDefined();
        expect(result).toBeInstanceOf(Result);
    });

    it('should have all required properties when populated', () => {
        // Initialize the result with test data
        result.id = 'test-id';
        result.plugin = 'test-plugin';
        result.result = {
            workspaces: {},
            analysis_info: { status: 'SUCCESS', errors: [], extra: {} }
        };
        result.analysis = {} as any; // Initialize analysis property

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('result');
        expect(result).toHaveProperty('analysis');
        expect(result).toHaveProperty('plugin');
    });

    it('should allow setting basic properties', () => {
        const testData = {
            id: 'result-uuid',
            plugin: 'js-sbom',
            result: {
                workspaces: {
                    default: {
                        dependencies: {}
                    }
                },
                analysis_info: {
                    status: 'SUCCESS',
                    errors: [],
                    extra: {}
                }
            }
        };

        Object.assign(result, testData);

        expect(result.id).toBe(testData.id);
        expect(result.plugin).toBe(testData.plugin);
        expect(result.result).toEqual(testData.result);
    });

    it('should handle different plugin types', () => {
        const plugins = ['js-sbom', 'js-vuln-finder', 'js-license', 'js-patching', 'codeql'];

        plugins.forEach((plugin) => {
            result.plugin = plugin;
            expect(result.plugin).toBe(plugin);
        });
    });

    it('should handle JSONB result object', () => {
        const complexResult: ResultObject = {
            workspaces: {
                frontend: {
                    dependencies: {
                        react: {
                            '18.0.0': {
                                name: 'react',
                                version: '18.0.0',
                                license: 'MIT'
                            }
                        }
                    }
                },
                backend: {
                    dependencies: {
                        express: {
                            '4.18.0': {
                                name: 'express',
                                version: '4.18.0',
                                license: 'MIT'
                            }
                        }
                    }
                }
            },
            analysis_info: {
                status: 'SUCCESS',
                package_manager: 'NPM',
                analysis_start_time: '2024-01-01T00:00:00Z',
                analysis_end_time: '2024-01-01T01:00:00Z',
                public_errors: [],
                private_errors: [],
                extra: {
                    version: '1.0.0',
                    config: {}
                }
            }
        };

        result.result = complexResult;
        expect(result.result).toEqual(complexResult);
        expect(result.result.workspaces).toBeDefined();
        expect(result.result.analysis_info).toBeDefined();
    });

    it('should handle analysis relationship', () => {
        const mockAnalysis = new Analysis();
        mockAnalysis.id = 'analysis-123';

        result.analysis = mockAnalysis;
        expect(result.analysis).toBe(mockAnalysis);
    });

    it('should handle vulnerability scan results', () => {
        const vulnResult: ResultObject = {
            workspaces: {
                default: {
                    affected_vulnerabilities: {
                        'CVE-2024-1234': {
                            vulnerability_id: 'CVE-2024-1234',
                            affected_deps: ['package1@1.0.0'],
                            severity: 'HIGH',
                            cvss_score: 7.5
                        }
                    },
                    Vulnerabilities: [
                        {
                            VulnerabilityId: 'CVE-2024-1234',
                            AffectedDependency: 'package1',
                            AffectedVersion: '1.0.0',
                            Severity: 'HIGH'
                        }
                    ]
                }
            },
            analysis_info: {
                status: 'SUCCESS',
                public_errors: [],
                private_errors: [],
                analysis_start_time: '2024-01-01T00:00:00Z',
                analysis_end_time: '2024-01-01T01:00:00Z'
            }
        };

        result.plugin = 'js-vuln-finder';
        result.result = vulnResult;

        expect(result.plugin).toBe('js-vuln-finder');
        expect((result.result.workspaces as any).default.affected_vulnerabilities).toBeDefined();
        expect((result.result.workspaces as any).default.Vulnerabilities).toHaveLength(1);
    });

    it('should handle license scan results', () => {
        const licenseResult: ResultObject = {
            workspaces: {
                default: {
                    LicensesDepMap: {
                        MIT: ['package1@1.0.0', 'package2@2.0.0'],
                        'Apache-2.0': ['package3@3.0.0']
                    },
                    NonSpdxLicensesDepMap: {},
                    LicenseComplianceViolations: []
                }
            },
            analysis_info: {
                status: 'SUCCESS',
                public_errors: [],
                private_errors: [],
                analysis_start_time: '2024-01-01T00:00:00Z',
                analysis_end_time: '2024-01-01T01:00:00Z'
            }
        };

        result.plugin = 'js-license';
        result.result = licenseResult;

        expect(result.plugin).toBe('js-license');
        expect((result.result.workspaces as any).default.LicensesDepMap).toBeDefined();
        expect((result.result.workspaces as any).default.LicensesDepMap.MIT).toHaveLength(2);
    });

    it('should handle empty result objects', () => {
        const emptyResult: ResultObject = {
            workspaces: {},
            analysis_info: {
                status: 'SUCCESS',
                errors: [],
                extra: {}
            }
        };

        result.result = emptyResult;
        expect(result.result.workspaces).toEqual({});
        expect(Object.keys(result.result.workspaces)).toHaveLength(0);
    });

    it('should handle failed analysis results', () => {
        const failedResult: ResultObject = {
            workspaces: {},
            analysis_info: {
                status: 'FAILURE',
                public_errors: ['Plugin execution failed'],
                private_errors: ['Internal error: database connection lost'],
                analysis_start_time: '2024-01-01T00:00:00Z',
                analysis_end_time: '2024-01-01T00:05:00Z'
            }
        };

        result.result = failedResult;
        expect(result.result.analysis_info.status).toBe('FAILURE');
        expect(result.result.analysis_info.public_errors).toHaveLength(1);
        expect(result.result.analysis_info.private_errors).toHaveLength(1);
    });
});

describe('ResultByAnalysisId Interface', () => {
    it('should match the expected structure', () => {
        const resultByAnalysisId: ResultByAnalysisId = {
            id: 'result-123',
            image: 'analysis-dashboard'
        };

        expect(resultByAnalysisId.id).toBe('result-123');
        expect(resultByAnalysisId.image).toBe('analysis-dashboard');
    });

    it('should handle different image types', () => {
        const images = [
            'sbom-graph',
            'vulnerability-report',
            'license-compliance',
            'dependency-tree'
        ];

        images.forEach((image) => {
            const result: ResultByAnalysisId = {
                id: 'result-123',
                image: image
            };
            expect(result.image).toBe(image);
        });
    });
});

describe('ResultObject Interface', () => {
    it('should match the expected structure', () => {
        const resultObject: ResultObject = {
            workspaces: {
                default: {
                    data: 'test'
                }
            },
            analysis_info: {
                status: 'SUCCESS',
                errors: [],
                extra: {}
            }
        };

        expect(resultObject.workspaces).toBeDefined();
        expect(resultObject.analysis_info).toBeDefined();
        expect(typeof resultObject.workspaces).toBe('object');
    });

    it('should handle multiple workspaces', () => {
        const resultObject: ResultObject = {
            workspaces: {
                frontend: { dependencies: {} },
                backend: { dependencies: {} },
                shared: { dependencies: {} }
            },
            analysis_info: {
                status: 'SUCCESS',
                errors: [],
                extra: {}
            }
        };

        expect(Object.keys(resultObject.workspaces)).toHaveLength(3);
        expect((resultObject.workspaces as any).frontend).toBeDefined();
        expect((resultObject.workspaces as any).backend).toBeDefined();
        expect((resultObject.workspaces as any).shared).toBeDefined();
    });
});

describe('AnalysisInfo Interface', () => {
    it('should match the expected structure', () => {
        const analysisInfo: AnalysisInfo = {
            extra: {
                version: '1.0.0',
                config: {}
            },
            errors: ['Warning: deprecated dependency'],
            status: 'SUCCESS',
            time: {
                start: '2024-01-01T00:00:00Z',
                end: '2024-01-01T01:00:00Z',
                duration_ms: 3600000
            }
        };

        expect(analysisInfo.extra).toBeDefined();
        expect(analysisInfo.errors).toBeDefined();
        expect(analysisInfo.status).toBe('SUCCESS');
        expect(analysisInfo.time).toBeDefined();
    });

    it('should handle different status values', () => {
        const statuses = ['SUCCESS', 'FAILURE', 'RUNNING', 'PENDING', 'CANCELLED'];

        statuses.forEach((status) => {
            const analysisInfo: AnalysisInfo = {
                extra: {},
                errors: [],
                status: status,
                time: {}
            };
            expect(analysisInfo.status).toBe(status);
        });
    });

    it('should handle various error types', () => {
        const analysisInfo: AnalysisInfo = {
            extra: {},
            errors: [
                { type: 'warning', message: 'Deprecated package found' },
                { type: 'error', message: 'Package not found' },
                'Simple string error'
            ],
            status: 'SUCCESS',
            time: {}
        };

        expect(analysisInfo.errors).toHaveLength(3);
        expect(analysisInfo.errors[0]).toEqual({
            type: 'warning',
            message: 'Deprecated package found'
        });
        expect(analysisInfo.errors[2]).toBe('Simple string error');
    });
});
