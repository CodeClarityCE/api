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
        })
    };

    const mockCWERepository = {
        findOne: jest.fn(),
        find: jest.fn()
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
                'default'
            );
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
                'default'
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
