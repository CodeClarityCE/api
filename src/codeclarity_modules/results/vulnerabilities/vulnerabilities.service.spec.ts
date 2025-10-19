import { Test, TestingModule } from '@nestjs/testing';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { AnalysisResultsService } from '../results.service';
import { VulnerabilitiesUtilsService } from './utils/utils.service';
import { VulnerabilitiesSortService } from './utils/sort.service';
import { VulnerabilitiesFilterService } from './utils/filter.service';
import { SbomUtilsService } from '../sbom/utils/utils';
import { OSVRepository } from 'src/codeclarity_modules/knowledge/osv/osv.repository';
import { CWERepository } from 'src/codeclarity_modules/knowledge/cwe/cwe.repository';
import { NVDRepository } from 'src/codeclarity_modules/knowledge/nvd/nvd.repository';
import { EPSSRepository } from 'src/codeclarity_modules/knowledge/epss/epss.repository';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { UnknownWorkspace } from 'src/types/error.types';
import { VulnerabilityPolicyService } from 'src/codeclarity_modules/policies/vulnerability/vulnerability.service';
import { AnalysesRepository } from 'src/base_modules/analyses/analyses.repository';

describe('VulnerabilitiesService', () => {
    let service: VulnerabilitiesService;
    let analysisResultsService: AnalysisResultsService;
    let findingsUtilsService: VulnerabilitiesUtilsService;
    let _findingsSortService: VulnerabilitiesSortService;
    let findingsFilterService: VulnerabilitiesFilterService;
    let _sbomUtilsService: SbomUtilsService;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockVulnsOutput = {
        workspaces: {
            default: {
                affected_vulnerabilities: {
                    'vuln-1': {
                        vulnerability_id: 'vuln-1',
                        affected_deps: ['package1@1.0.0'],
                        sources: ['OSV'],
                        severity: 'HIGH'
                    }
                }
            }
        },
        analysis_info: {
            public_errors: [],
            private_errors: [],
            analysis_start_time: '2024-01-01T00:00:00Z',
            analysis_end_time: '2024-01-01T01:00:00Z'
        }
    };

    const _mockSbomOutput = {
        workspaces: {
            default: {
                dependencies: {
                    package1: {
                        '1.0.0': {
                            name: 'package1',
                            version: '1.0.0'
                        }
                    }
                }
            }
        }
    };

    const mockAnalysisResultsService = {
        checkAccess: jest.fn()
    };

    const mockFindingsUtilsService = {
        getVulnsResult: jest.fn(),
        getFindingsData: jest.fn().mockResolvedValue([
            {
                vulnerability_id: 'CVE-2024-1234',
                affected_deps: ['package1@1.0.0'],
                sources: ['OSV'],
                severity: 'HIGH',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Id: 'vuln-1'
            }
        ])
    };

    const mockFindingsSortService = {
        sort: jest.fn().mockReturnValue([
            {
                vulnerability_id: 'CVE-2024-1234',
                affected_deps: ['package1@1.0.0'],
                sources: ['OSV'],
                severity: 'HIGH',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Id: 'vuln-1'
            }
        ])
    };

    const mockFindingsFilterService = {
        filter: jest.fn().mockReturnValue([
            [
                {
                    vulnerability_id: 'CVE-2024-1234',
                    affected_deps: ['package1@1.0.0'],
                    sources: ['OSV'],
                    severity: 'HIGH',
                    AffectedDependency: 'package1',
                    AffectedVersion: '1.0.0',
                    Sources: ['OSV'],
                    VulnerabilityId: 'CVE-2024-1234',
                    Vulnerability: 'CVE-2024-1234',
                    Id: 'vuln-1'
                }
            ],
            {}
        ])
    };

    const mockSbomUtilsService = {
        getSbomResult: jest.fn().mockResolvedValue({
            workspaces: {
                default: {}
            }
        })
    };

    const mockOSVRepository = {
        findOne: jest.fn(),
        find: jest.fn(),
        getVulnByCVEIDWithoutFailing: jest.fn().mockResolvedValue({
            summary: 'Test OSV summary',
            details: 'Test OSV details'
        }),
        getVulnByOSVIDWithoutFailing: jest.fn().mockResolvedValue({
            summary: 'Test GHSA summary',
            details: 'Test GHSA details'
        })
    };

    const mockCWERepository = {
        findOne: jest.fn(),
        find: jest.fn(),
        getCWEWithoutFailing: jest.fn().mockResolvedValue({
            name: 'Test CWE Name',
            description: 'Test CWE Description',
            extended_description: 'Test CWE Extended Description'
        })
    };

    const mockNVDRepository = {
        findOne: jest.fn(),
        find: jest.fn(),
        getVulnWithoutFailing: jest.fn().mockResolvedValue({
            descriptions: [{ value: 'Test NVD description' }]
        })
    };

    const mockEPSSRepository = {
        findOne: jest.fn(),
        find: jest.fn(),
        getByCVE: jest.fn().mockResolvedValue({ percentile: 0.1, score: 0.05 })
    };

    const mockVulnerabilityPolicyService = {
        getVulnerabilityPoliciesMap: jest.fn().mockResolvedValue(new Map())
    };

    const mockAnalysesRepository = {
        getAnalysisById: jest.fn(),
        saveAnalysis: jest.fn(),
        doesAnalysesBelongToProject: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VulnerabilitiesService,
                {
                    provide: AnalysisResultsService,
                    useValue: mockAnalysisResultsService
                },
                {
                    provide: VulnerabilitiesUtilsService,
                    useValue: mockFindingsUtilsService
                },
                {
                    provide: VulnerabilitiesSortService,
                    useValue: mockFindingsSortService
                },
                {
                    provide: VulnerabilitiesFilterService,
                    useValue: mockFindingsFilterService
                },
                {
                    provide: SbomUtilsService,
                    useValue: mockSbomUtilsService
                },
                {
                    provide: OSVRepository,
                    useValue: mockOSVRepository
                },
                {
                    provide: CWERepository,
                    useValue: mockCWERepository
                },
                {
                    provide: NVDRepository,
                    useValue: mockNVDRepository
                },
                {
                    provide: EPSSRepository,
                    useValue: mockEPSSRepository
                },
                {
                    provide: VulnerabilityPolicyService,
                    useValue: mockVulnerabilityPolicyService
                },
                {
                    provide: AnalysesRepository,
                    useValue: mockAnalysesRepository
                }
            ]
        }).compile();

        service = module.get<VulnerabilitiesService>(VulnerabilitiesService);
        analysisResultsService = module.get<AnalysisResultsService>(AnalysisResultsService);
        findingsUtilsService = module.get<VulnerabilitiesUtilsService>(VulnerabilitiesUtilsService);
        _findingsSortService = module.get<VulnerabilitiesSortService>(VulnerabilitiesSortService);
        findingsFilterService = module.get<VulnerabilitiesFilterService>(
            VulnerabilitiesFilterService
        );
        _sbomUtilsService = module.get<SbomUtilsService>(SbomUtilsService);

        jest.clearAllMocks();

        // Reset all mocks to their default state
        mockSbomUtilsService.getSbomResult.mockResolvedValue({
            workspaces: {
                default: {}
            }
        });
        mockFindingsUtilsService.getFindingsData.mockResolvedValue([]);
        mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
    });

    describe('getStats', () => {
        it('should return vulnerability analysis stats', async () => {
            const mockVulnsOutputWithArray = {
                ...mockVulnsOutput,
                workspaces: {
                    default: {
                        affected_vulnerabilities: {
                            'vuln-1': {
                                vulnerability_id: 'vuln-1',
                                affected_deps: ['package1@1.0.0'],
                                sources: ['OSV'],
                                severity: 'HIGH'
                            }
                        },
                        Vulnerabilities: [
                            {
                                vulnerability_id: 'vuln-1',
                                AffectedDependency: 'package1',
                                AffectedVersion: '1.0.0',
                                Sources: ['OSV']
                            }
                        ]
                    }
                }
            };

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockFindingsUtilsService.getVulnsResult.mockResolvedValue(mockVulnsOutputWithArray);

            const result = await service.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result).toBeDefined();
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
            expect(findingsUtilsService.getFindingsData).toHaveBeenCalledWith(
                'analysis-123',
                'default',
                undefined // ecosystem_filter
            );
        });

        it('should throw UnknownWorkspace when workspace does not exist', async () => {
            const mockSbomOutputEmptyWorkspace = {
                workspaces: {}
            };

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutputEmptyWorkspace);

            await expect(
                service.getStats('org-123', 'project-123', 'analysis-123', mockUser, 'unknown')
            ).rejects.toThrow(UnknownWorkspace);
        });

        it('should handle findings with null severity', async () => {
            const mockFindingsNullSeverity = [
                {
                    Id: 'vuln-1',
                    VulnerabilityId: 'CVE-2024-1234',
                    AffectedDependency: 'package1',
                    AffectedVersion: '1.0.0',
                    Sources: ['OSV'],
                    Severity: null,
                    Weaknesses: null
                }
            ];

            mockFindingsUtilsService.getFindingsData.mockResolvedValue(mockFindingsNullSeverity);

            const result = await service.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result.number_of_none).toBe(1);
            expect(result.max_severity).toBe(0);
            expect(result.mean_severity).toBe(0);
        });

        it('should handle findings with OWASP Top 10 2021 weaknesses', async () => {
            const mockFindingsWithWeaknesses = [
                {
                    Id: 'vuln-1',
                    VulnerabilityId: 'CVE-2024-1234',
                    AffectedDependency: 'package1',
                    AffectedVersion: '1.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 7.5,
                        ConfidentialityImpact: 'HIGH',
                        IntegrityImpact: 'HIGH',
                        AvailabilityImpact: 'HIGH'
                    },
                    Weaknesses: [
                        { WeaknessId: 'CWE-79', OWASPTop10Id: '1345' },
                        { WeaknessId: 'CWE-89', OWASPTop10Id: '1347' }
                    ]
                }
            ];

            mockFindingsUtilsService.getFindingsData.mockResolvedValue(mockFindingsWithWeaknesses);

            const result = await service.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result.number_of_owasp_top_10_2021_a1).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a3).toBe(1);
        });

        it('should handle findings with CVSS v2 and v3 metrics', async () => {
            const mockFindingsWithCVSS = [
                {
                    Id: 'vuln-1',
                    VulnerabilityId: 'CVE-2024-1234',
                    AffectedDependency: 'package1',
                    AffectedVersion: '1.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 7.5,
                        ConfidentialityImpact: 'COMPLETE',
                        IntegrityImpact: 'PARTIAL',
                        AvailabilityImpact: 'LOW'
                    },
                    Weaknesses: null
                }
            ];

            mockFindingsUtilsService.getFindingsData.mockResolvedValue(mockFindingsWithCVSS);

            const result = await service.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result.mean_confidentiality_impact).toBe(1.0);
            expect(result.mean_integrity_impact).toBe(0.5);
            expect(result.mean_availability_impact).toBe(0.5);
        });

        it('should handle different severity levels', async () => {
            const mockFindingsWithSeverities = [
                {
                    Id: 'vuln-1',
                    VulnerabilityId: 'CVE-2024-1234',
                    AffectedDependency: 'package1',
                    AffectedVersion: '1.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 0.0,
                        ConfidentialityImpact: 'NONE',
                        IntegrityImpact: 'NONE',
                        AvailabilityImpact: 'NONE'
                    },
                    Weaknesses: null
                },
                {
                    Id: 'vuln-2',
                    VulnerabilityId: 'CVE-2024-5678',
                    AffectedDependency: 'package2',
                    AffectedVersion: '2.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 1.0,
                        ConfidentialityImpact: 'LOW',
                        IntegrityImpact: 'LOW',
                        AvailabilityImpact: 'LOW'
                    },
                    Weaknesses: null
                },
                {
                    Id: 'vuln-3',
                    VulnerabilityId: 'CVE-2024-9012',
                    AffectedDependency: 'package3',
                    AffectedVersion: '3.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 5.0,
                        ConfidentialityImpact: 'MEDIUM',
                        IntegrityImpact: 'MEDIUM',
                        AvailabilityImpact: 'MEDIUM'
                    },
                    Weaknesses: null
                },
                {
                    Id: 'vuln-4',
                    VulnerabilityId: 'CVE-2024-3456',
                    AffectedDependency: 'package4',
                    AffectedVersion: '4.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 8.9,
                        ConfidentialityImpact: 'HIGH',
                        IntegrityImpact: 'HIGH',
                        AvailabilityImpact: 'HIGH'
                    },
                    Weaknesses: null
                },
                {
                    Id: 'vuln-5',
                    VulnerabilityId: 'CVE-2024-7890',
                    AffectedDependency: 'package5',
                    AffectedVersion: '5.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 9.8,
                        ConfidentialityImpact: 'CRITICAL',
                        IntegrityImpact: 'CRITICAL',
                        AvailabilityImpact: 'CRITICAL'
                    },
                    Weaknesses: null
                }
            ];

            mockFindingsUtilsService.getFindingsData.mockResolvedValue(mockFindingsWithSeverities);

            const result = await service.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result.number_of_none).toBe(1);
            expect(result.number_of_low).toBe(1);
            expect(result.number_of_medium).toBe(1);
            expect(result.number_of_high).toBe(1);
            expect(result.number_of_critical).toBe(1);
            expect(result.max_severity).toBe(9.8);
        });

        it('should handle all OWASP Top 10 2021 categories', async () => {
            const mockFindingsWithAllOWASP = [
                {
                    Id: 'vuln-1',
                    VulnerabilityId: 'CVE-2024-1234',
                    AffectedDependency: 'package1',
                    AffectedVersion: '1.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 7.5,
                        ConfidentialityImpact: 'HIGH',
                        IntegrityImpact: 'HIGH',
                        AvailabilityImpact: 'HIGH'
                    },
                    Weaknesses: [
                        { WeaknessId: 'CWE-79', OWASPTop10Id: '1345' },
                        { WeaknessId: 'CWE-89', OWASPTop10Id: '1346' },
                        { WeaknessId: 'CWE-798', OWASPTop10Id: '1347' },
                        { WeaknessId: 'CWE-611', OWASPTop10Id: '1348' },
                        { WeaknessId: 'CWE-862', OWASPTop10Id: '1349' },
                        { WeaknessId: 'CWE-1188', OWASPTop10Id: '1352' },
                        { WeaknessId: 'CWE-614', OWASPTop10Id: '1353' },
                        { WeaknessId: 'CWE-1275', OWASPTop10Id: '1354' },
                        { WeaknessId: 'CWE-1021', OWASPTop10Id: '1355' },
                        { WeaknessId: 'CWE-918', OWASPTop10Id: '1356' }
                    ]
                }
            ];

            mockFindingsUtilsService.getFindingsData.mockResolvedValue(mockFindingsWithAllOWASP);

            const result = await service.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result.number_of_owasp_top_10_2021_a1).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a2).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a3).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a4).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a5).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a6).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a7).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a8).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a9).toBe(1);
            expect(result.number_of_owasp_top_10_2021_a10).toBe(1);
        });

        it('should handle empty findings array', async () => {
            const result = await service.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result.number_of_issues).toBe(0);
            expect(result.number_of_vulnerabilities).toBe(0);
            expect(result.number_of_vulnerable_dependencies).toBe(0);
            expect(result.mean_severity).toBe(0);
            expect(result.max_severity).toBe(0);
        });

        it('should handle access check failure', async () => {
            const accessError = new Error('Access denied');
            mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

            await expect(
                service.getStats('org-123', 'project-123', 'analysis-123', mockUser, 'default')
            ).rejects.toThrow('Access denied');

            expect(findingsUtilsService.getVulnsResult).not.toHaveBeenCalled();
        });
    });

    describe('getVulnerabilities', () => {
        it('should return paginated vulnerabilities data', async () => {
            // Mock the external repositories to avoid the "includes" error
            mockNVDRepository.getVulnWithoutFailing.mockResolvedValue(null);
            mockOSVRepository.getVulnByCVEIDWithoutFailing.mockResolvedValue(null);

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockFindingsUtilsService.getVulnsResult.mockResolvedValue(mockVulnsOutput);
            mockFindingsFilterService.filter.mockReturnValue([[], {}]);
            mockFindingsSortService.sort.mockReturnValue([]);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(result).toBeDefined();
            expect(result.data).toBeDefined();
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
            expect(findingsUtilsService.getFindingsData).toHaveBeenCalledWith(
                'analysis-123',
                'default',
                undefined // ecosystem_filter
            );
        });

        it('should handle active filters', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockFindingsUtilsService.getVulnsResult.mockResolvedValue(mockVulnsOutput);
            mockFindingsFilterService.filter.mockReturnValue([[], {}]);
            mockFindingsSortService.sort.mockReturnValue([]);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                '[HIGH,CRITICAL]',
                'test'
            );

            expect(result).toBeDefined();
            expect(findingsFilterService.filter).toHaveBeenCalled();
        });

        it('should handle access check failure', async () => {
            const accessError = new Error('Access denied');
            mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

            await expect(
                service.getVulnerabilities(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    mockUser,
                    'default',
                    0,
                    20,
                    'severity',
                    'desc',
                    undefined,
                    undefined
                )
            ).rejects.toThrow('Access denied');
        });

        it('should handle vulnerability merging with multiple affected dependencies', async () => {
            const mockFindingsWithDuplicates = [
                {
                    Id: 'vuln-1',
                    VulnerabilityId: 'CVE-2024-1234',
                    AffectedDependency: 'package1',
                    AffectedVersion: '1.0.0',
                    Sources: ['OSV'],
                    Severity: {
                        Severity: 7.5,
                        ConfidentialityImpact: 'HIGH',
                        IntegrityImpact: 'HIGH',
                        AvailabilityImpact: 'HIGH'
                    },
                    Weaknesses: [],
                    OSVMatch: { Vulnerability: { Vlai_score: 0.8, Vlai_confidence: 0.9 } },
                    NVDMatch: { Vulnerability: { Vlai_score: 0.7, Vlai_confidence: 0.8 } },
                    Conflict: false
                },
                {
                    Id: 'vuln-2',
                    VulnerabilityId: 'CVE-2024-1234',
                    AffectedDependency: 'package2',
                    AffectedVersion: '2.0.0',
                    Sources: ['NVD'],
                    Severity: {
                        Severity: 7.5,
                        ConfidentialityImpact: 'HIGH',
                        IntegrityImpact: 'HIGH',
                        AvailabilityImpact: 'HIGH'
                    },
                    Weaknesses: [],
                    OSVMatch: null,
                    NVDMatch: { Vulnerability: { Vlai_score: 0.7, Vlai_confidence: 0.8 } },
                    Conflict: false
                }
            ];

            mockFindingsUtilsService.getFindingsData.mockResolvedValue(mockFindingsWithDuplicates);

            const expectedMergedVulnerability = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: { Vulnerability: { Vlai_score: 0.8, Vlai_confidence: 0.9 } },
                        NVDMatch: { Vulnerability: { Vlai_score: 0.7, Vlai_confidence: 0.8 } },
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [],
                        Conflict: false
                    },
                    {
                        Sources: ['NVD'],
                        AffectedDependency: 'package2',
                        AffectedVersion: '2.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: null,
                        NVDMatch: { Vulnerability: { Vlai_score: 0.7, Vlai_confidence: 0.8 } },
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [],
                        Conflict: false
                    }
                ],
                Description: '',
                Sources: ['OSV'],
                Conflict: false,
                VLAI: [
                    { Source: 'Osv', Score: 0.8, Confidence: 0.9 },
                    { Source: 'Nvd', Score: 0.7, Confidence: 0.8 }
                ],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsFilterService.filter.mockReturnValue([[expectedMergedVulnerability], {}]);
            mockFindingsSortService.sort.mockReturnValue([expectedMergedVulnerability]);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(result.data).toHaveLength(1);
            expect(result.data[0].Affected).toHaveLength(2);
            expect(result.data[0].VLAI).toHaveLength(2);
        });

        it('should handle CVE vulnerability descriptions', async () => {
            const mockCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                OSVMatch: null,
                NVDMatch: null,
                Conflict: false
            };

            const mockMergedCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: null,
                        NVDMatch: null,
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [],
                        Conflict: false
                    }
                ],
                Description: '',
                Conflict: false,
                VLAI: [],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsUtilsService.getFindingsData.mockResolvedValue([mockCVEFinding]);
            mockFindingsFilterService.filter.mockReturnValue([[mockMergedCVEFinding], {}]);
            mockFindingsSortService.sort.mockReturnValue([mockMergedCVEFinding]);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(mockNVDRepository.getVulnWithoutFailing).toHaveBeenCalledWith('CVE-2024-1234');
            expect(mockOSVRepository.getVulnByCVEIDWithoutFailing).toHaveBeenCalledWith(
                'CVE-2024-1234'
            );
            expect(result.data[0].Description).toBe('#### .\n\n');
        });

        it('should handle GHSA vulnerability descriptions', async () => {
            const mockGHSAFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'GHSA-xxxx-yyyy-zzzz',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                OSVMatch: null,
                NVDMatch: null,
                Conflict: false
            };

            const mockMergedGHSAFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'GHSA-xxxx-yyyy-zzzz',
                Vulnerability: 'GHSA-xxxx-yyyy-zzzz',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'GHSA-xxxx-yyyy-zzzz',
                        OSVMatch: null,
                        NVDMatch: null,
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [],
                        Conflict: false
                    }
                ],
                Description: '',
                Conflict: false,
                VLAI: [],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsUtilsService.getFindingsData.mockResolvedValue([mockGHSAFinding]);
            mockFindingsFilterService.filter.mockReturnValue([[mockMergedGHSAFinding], {}]);
            mockFindingsSortService.sort.mockReturnValue([mockMergedGHSAFinding]);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(mockOSVRepository.getVulnByOSVIDWithoutFailing).toHaveBeenCalledWith(
                'GHSA-xxxx-yyyy-zzzz'
            );
            expect(result.data[0].Description).toContain('Test GHSA summary');
        });

        it('should handle weaknesses with CWE information', async () => {
            const mockFindingWithWeakness = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [{ WeaknessId: 'CWE-79', OWASPTop10Id: '1345' }],
                OSVMatch: null,
                NVDMatch: null,
                Conflict: false
            };

            const mockMergedFindingWithWeakness = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [{ WeaknessId: 'CWE-79', OWASPTop10Id: '1345' }],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: null,
                        NVDMatch: null,
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [{ WeaknessId: 'CWE-79', OWASPTop10Id: '1345' }],
                        Conflict: false
                    }
                ],
                Description: '',
                Conflict: false,
                VLAI: [],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsUtilsService.getFindingsData.mockResolvedValue([mockFindingWithWeakness]);
            mockFindingsFilterService.filter.mockReturnValue([[mockMergedFindingWithWeakness], {}]);
            mockFindingsSortService.sort.mockReturnValue([mockMergedFindingWithWeakness]);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(mockCWERepository.getCWEWithoutFailing).toHaveBeenCalledWith('79');
            expect(result.data[0].Weaknesses[0].WeaknessName).toBe('Test CWE Name');
            expect(result.data[0].Weaknesses[0].WeaknessDescription).toBe('Test CWE Description');
        });

        it('should handle weaknesses with CWE lookup failure', async () => {
            const mockFindingWithWeakness = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [{ WeaknessId: 'CWE-79', OWASPTop10Id: '1345' }],
                OSVMatch: null,
                NVDMatch: null,
                Conflict: false
            };

            const mockMergedFindingWithWeakness = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [{ WeaknessId: 'CWE-79', OWASPTop10Id: '1345' }],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: null,
                        NVDMatch: null,
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [{ WeaknessId: 'CWE-79', OWASPTop10Id: '1345' }],
                        Conflict: false
                    }
                ],
                Description: '',
                Conflict: false,
                VLAI: [],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsUtilsService.getFindingsData.mockResolvedValue([mockFindingWithWeakness]);
            mockFindingsFilterService.filter.mockReturnValue([[mockMergedFindingWithWeakness], {}]);
            mockFindingsSortService.sort.mockReturnValue([mockMergedFindingWithWeakness]);
            mockCWERepository.getCWEWithoutFailing.mockResolvedValue(null);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(result.data[0].Weaknesses[0].WeaknessName).toBe('');
            expect(result.data[0].Weaknesses[0].WeaknessDescription).toBe('');
            expect(result.data[0].Weaknesses[0].WeaknessExtendedDescription).toBe('');
        });

        it('should handle NVD description when OSV is empty', async () => {
            const mockCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                OSVMatch: null,
                NVDMatch: null,
                Conflict: false
            };

            const mockMergedCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: null,
                        NVDMatch: null,
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [],
                        Conflict: false
                    }
                ],
                Description: '',
                Conflict: false,
                VLAI: [],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsUtilsService.getFindingsData.mockResolvedValue([mockCVEFinding]);
            mockFindingsFilterService.filter.mockReturnValue([[mockMergedCVEFinding], {}]);
            mockFindingsSortService.sort.mockReturnValue([mockMergedCVEFinding]);
            mockOSVRepository.getVulnByCVEIDWithoutFailing.mockResolvedValue(null);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(result.data[0].Description).toBe('#### .\n\n');
        });

        it('should handle OSV description formatting with capitalization and punctuation', async () => {
            const mockCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                OSVMatch: null,
                NVDMatch: null,
                Conflict: false
            };

            const mockMergedCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: null,
                        NVDMatch: null,
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [],
                        Conflict: false
                    }
                ],
                Description: '',
                Conflict: false,
                VLAI: [],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsUtilsService.getFindingsData.mockResolvedValue([mockCVEFinding]);
            mockFindingsFilterService.filter.mockReturnValue([[mockMergedCVEFinding], {}]);
            mockFindingsSortService.sort.mockReturnValue([mockMergedCVEFinding]);
            mockOSVRepository.getVulnByCVEIDWithoutFailing.mockResolvedValue({
                summary: 'test osv summary',
                details: 'test osv details without period'
            });

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(result.data[0].Description).toBe(
                '#### Test osv summary.\n\nTest osv details without period.'
            );
        });

        it('should handle OSV description that ends with backticks', async () => {
            const mockCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                AffectedDependency: 'package1',
                AffectedVersion: '1.0.0',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                OSVMatch: null,
                NVDMatch: null,
                Conflict: false
            };

            const mockMergedCVEFinding = {
                Id: 'vuln-1',
                VulnerabilityId: 'CVE-2024-1234',
                Vulnerability: 'CVE-2024-1234',
                Sources: ['OSV'],
                Severity: {
                    Severity: 7.5,
                    ConfidentialityImpact: 'HIGH',
                    IntegrityImpact: 'HIGH',
                    AvailabilityImpact: 'HIGH'
                },
                Weaknesses: [],
                Affected: [
                    {
                        Sources: ['OSV'],
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        VulnerabilityId: 'CVE-2024-1234',
                        OSVMatch: null,
                        NVDMatch: null,
                        Severity: {
                            Severity: 7.5,
                            ConfidentialityImpact: 'HIGH',
                            IntegrityImpact: 'HIGH',
                            AvailabilityImpact: 'HIGH'
                        },
                        Weaknesses: [],
                        Conflict: false
                    }
                ],
                Description: '',
                Conflict: false,
                VLAI: [],
                EPSS: { Score: 0.05, Percentile: 0.1 }
            };

            mockFindingsUtilsService.getFindingsData.mockResolvedValue([mockCVEFinding]);
            mockFindingsFilterService.filter.mockReturnValue([[mockMergedCVEFinding], {}]);
            mockFindingsSortService.sort.mockReturnValue([mockMergedCVEFinding]);
            mockOSVRepository.getVulnByCVEIDWithoutFailing.mockResolvedValue({
                summary: 'test summary',
                details: 'test details with code ```'
            });

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                undefined,
                undefined
            );

            expect(result.data[0].Description).toBe(
                '#### Test summary.\n\nTest details with code ```'
            );
        });

        it('should handle empty filters array', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockFindingsUtilsService.getFindingsData.mockResolvedValue([]);
            mockFindingsFilterService.filter.mockReturnValue([[], {}]);
            mockFindingsSortService.sort.mockReturnValue([]);

            const result = await service.getVulnerabilities(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'severity',
                'desc',
                '[]',
                undefined
            );

            expect(result.data).toEqual([]);
            expect(findingsFilterService.filter).toHaveBeenCalledWith([], undefined, ['']);
        });
    });

    describe('cleanOsvDescription', () => {
        it('should clean OSV description by removing unwanted sections', () => {
            const inputDescription =
                '# Title\nThis is the main description.\n# References\nSome references.\n# Other Section\n```\nCode block\n```\n# More\nMore text.';
            const expectedDescription =
                ' Title\nThis is the main description.\n\n Other Section\n```\nCode block\n```';

            const result = (service as any).cleanOsvDescription(inputDescription);

            expect(result).toBe(expectedDescription);
        });

        it('should handle description with only code blocks', () => {
            const inputDescription = '# Title\n```\nCode block\n```';
            const expectedDescription = ' Title\n```\nCode block\n```';

            const result = (service as any).cleanOsvDescription(inputDescription);

            expect(result).toBe(expectedDescription);
        });

        it('should handle description with trailing newlines', () => {
            const inputDescription = '# Title\nDescription text.\n\n\n';
            const expectedDescription = ' Title\nDescription text.';

            const result = (service as any).cleanOsvDescription(inputDescription);

            expect(result).toBe(expectedDescription);
        });

        it('should handle empty description', () => {
            const inputDescription = '';
            const expectedDescription = '';

            const result = (service as any).cleanOsvDescription(inputDescription);

            expect(result).toBe(expectedDescription);
        });

        it('should handle description without headers', () => {
            const inputDescription = 'Just plain text without headers.';
            const expectedDescription = 'Just plain text without headers.';

            const result = (service as any).cleanOsvDescription(inputDescription);

            expect(result).toBe(expectedDescription);
        });
    });

    describe('getStatus', () => {
        it('should return status with no errors', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockFindingsUtilsService.getVulnsResult.mockResolvedValue(mockVulnsOutput);

            const result = await service.getStatus(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );

            expect(result).toEqual({
                stage_start: '2024-01-01T00:00:00Z',
                stage_end: '2024-01-01T01:00:00Z'
            });
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
        });

        it('should return status with errors when private errors exist', async () => {
            const outputWithErrors = {
                ...mockVulnsOutput,
                analysis_info: {
                    ...mockVulnsOutput.analysis_info,
                    public_errors: ['Public error'],
                    private_errors: ['Private error']
                }
            };

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockFindingsUtilsService.getVulnsResult.mockResolvedValue(outputWithErrors);

            const result = await service.getStatus(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );

            expect(result).toEqual({
                public_errors: ['Public error'],
                private_errors: ['Private error'],
                stage_start: '2024-01-01T00:00:00Z',
                stage_end: '2024-01-01T01:00:00Z'
            });
        });

        it('should handle access check failure', async () => {
            const accessError = new Error('Access denied');
            mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

            await expect(
                service.getStatus('org-123', 'project-123', 'analysis-123', mockUser)
            ).rejects.toThrow('Access denied');
        });
    });
});
