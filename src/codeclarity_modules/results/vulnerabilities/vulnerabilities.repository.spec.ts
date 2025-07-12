import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VulnerabilitiesRepository } from './vulnerabilities.repository';
import { Result } from '../result.entity';
import { Status } from './vulnerabilities.types';
import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';

describe('VulnerabilitiesRepository', () => {
    let repository: VulnerabilitiesRepository;
    let resultRepository: any;

    const mockVulnsOutput = {
        workspaces: {
            default: {
                affected_vulnerabilities: {
                    'CVE-2024-1234': {
                        vulnerability_id: 'CVE-2024-1234',
                        affected_deps: ['package1@1.0.0'],
                        sources: ['OSV', 'NVD'],
                        severity: 'HIGH',
                        cvss_score: 7.5
                    },
                    'GHSA-5678-9abc-def0': {
                        vulnerability_id: 'GHSA-5678-9abc-def0',
                        affected_deps: ['package2@2.0.0'],
                        sources: ['OSV'],
                        severity: 'MEDIUM',
                        cvss_score: 5.5
                    }
                },
                Vulnerabilities: [
                    {
                        VulnerabilityId: 'CVE-2024-1234',
                        AffectedDependency: 'package1',
                        AffectedVersion: '1.0.0',
                        Severity: 'HIGH',
                        Sources: ['OSV', 'NVD']
                    },
                    {
                        VulnerabilityId: 'GHSA-5678-9abc-def0',
                        AffectedDependency: 'package2',
                        AffectedVersion: '2.0.0',
                        Severity: 'MEDIUM',
                        Sources: ['OSV']
                    }
                ]
            }
        },
        analysis_info: {
            status: Status.Success,
            public_errors: [],
            private_errors: [],
            analysis_start_time: '2024-01-01T00:00:00Z',
            analysis_end_time: '2024-01-01T01:00:00Z'
        }
    };

    const mockResult = {
        id: 'result-123',
        plugin: 'js-vuln-finder',
        result: mockVulnsOutput,
        analysis: {
            id: 'analysis-123',
            created_on: new Date('2024-01-01')
        }
    };

    const mockResultRepository = {
        findOne: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VulnerabilitiesRepository,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockResultRepository
                }
            ]
        }).compile();

        repository = module.get<VulnerabilitiesRepository>(VulnerabilitiesRepository);
        resultRepository = module.get(getRepositoryToken(Result, 'codeclarity'));

        jest.clearAllMocks();
    });

    describe('getVulnsResult', () => {
        it('should return vulnerabilities output for successful analysis', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            const result = await repository.getVulnsResult('analysis-123');

            expect(result).toEqual(mockVulnsOutput);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'analysis-123'
                    },
                    plugin: 'js-vuln-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should throw PluginResultNotAvailable when no result exists', async () => {
            mockResultRepository.findOne.mockResolvedValue(null);

            await expect(repository.getVulnsResult('non-existent-analysis')).rejects.toThrow(
                PluginResultNotAvailable
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'non-existent-analysis'
                    },
                    plugin: 'js-vuln-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should throw PluginFailed when analysis status is Failure', async () => {
            const failedResult = {
                ...mockResult,
                result: {
                    ...mockVulnsOutput,
                    analysis_info: {
                        ...mockVulnsOutput.analysis_info,
                        status: Status.Failure
                    }
                }
            };
            mockResultRepository.findOne.mockResolvedValue(failedResult);

            await expect(repository.getVulnsResult('analysis-123')).rejects.toThrow(PluginFailed);

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'analysis-123'
                    },
                    plugin: 'js-vuln-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should return result with Success status without throwing error', async () => {
            const successResult = {
                ...mockResult,
                result: {
                    ...mockVulnsOutput,
                    analysis_info: {
                        ...mockVulnsOutput.analysis_info,
                        status: Status.Success
                    }
                }
            };
            mockResultRepository.findOne.mockResolvedValue(successResult);

            const result = await repository.getVulnsResult('analysis-123');

            expect(result).toEqual(successResult.result);
            expect(result.analysis_info.status).toBe(Status.Success);
        });

        it('should handle complex vulnerabilities structure with multiple workspaces', async () => {
            const complexVulnsOutput = {
                workspaces: {
                    frontend: {
                        affected_vulnerabilities: {
                            'CVE-2024-1111': {
                                vulnerability_id: 'CVE-2024-1111',
                                affected_deps: ['react@17.0.0'],
                                sources: ['NVD'],
                                severity: 'CRITICAL',
                                cvss_score: 9.8
                            }
                        },
                        Vulnerabilities: [
                            {
                                VulnerabilityId: 'CVE-2024-1111',
                                AffectedDependency: 'react',
                                AffectedVersion: '17.0.0',
                                Severity: 'CRITICAL',
                                Sources: ['NVD']
                            }
                        ]
                    },
                    backend: {
                        affected_vulnerabilities: {
                            'CVE-2024-2222': {
                                vulnerability_id: 'CVE-2024-2222',
                                affected_deps: ['express@4.17.0'],
                                sources: ['OSV'],
                                severity: 'LOW',
                                cvss_score: 3.1
                            }
                        },
                        Vulnerabilities: [
                            {
                                VulnerabilityId: 'CVE-2024-2222',
                                AffectedDependency: 'express',
                                AffectedVersion: '4.17.0',
                                Severity: 'LOW',
                                Sources: ['OSV']
                            }
                        ]
                    }
                },
                analysis_info: {
                    status: Status.Success,
                    public_errors: [],
                    private_errors: [],
                    analysis_start_time: '2024-01-01T00:00:00Z',
                    analysis_end_time: '2024-01-01T01:00:00Z'
                }
            };

            const complexResult = {
                ...mockResult,
                result: complexVulnsOutput
            };
            mockResultRepository.findOne.mockResolvedValue(complexResult);

            const result = await repository.getVulnsResult('analysis-123');

            expect(result).toEqual(complexVulnsOutput);
            expect(Object.keys(result.workspaces)).toEqual(['frontend', 'backend']);
            expect(
                (result.workspaces as any).frontend.affected_vulnerabilities['CVE-2024-1111']
                    .severity
            ).toBe('CRITICAL');
            expect(
                (result.workspaces as any).backend.affected_vulnerabilities['CVE-2024-2222']
                    .severity
            ).toBe('LOW');
        });

        it('should handle vulnerabilities with no affected vulnerabilities', async () => {
            const emptyVulnsOutput = {
                workspaces: {
                    default: {
                        affected_vulnerabilities: {},
                        Vulnerabilities: []
                    }
                },
                analysis_info: {
                    status: Status.Success,
                    public_errors: [],
                    private_errors: [],
                    analysis_start_time: '2024-01-01T00:00:00Z',
                    analysis_end_time: '2024-01-01T01:00:00Z'
                }
            };

            const emptyResult = {
                ...mockResult,
                result: emptyVulnsOutput
            };
            mockResultRepository.findOne.mockResolvedValue(emptyResult);

            const result = await repository.getVulnsResult('analysis-123');

            expect(result).toEqual(emptyVulnsOutput);
            expect(
                Object.keys((result.workspaces as any).default.affected_vulnerabilities)
            ).toHaveLength(0);
            expect((result.workspaces as any).default.Vulnerabilities).toHaveLength(0);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.findOne.mockRejectedValue(dbError);

            await expect(repository.getVulnsResult('analysis-123')).rejects.toThrow(
                'Database connection failed'
            );
        });

        it('should use correct ordering and caching', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            await repository.getVulnsResult('analysis-123');

            expect(resultRepository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    order: {
                        analysis: {
                            created_on: 'DESC'
                        }
                    },
                    cache: true
                })
            );
        });

        it('should filter by correct plugin name', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            await repository.getVulnsResult('analysis-123');

            expect(resultRepository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        plugin: 'js-vuln-finder'
                    })
                })
            );
        });

        it('should include analysis relations', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            await repository.getVulnsResult('analysis-123');

            expect(resultRepository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    relations: { analysis: true }
                })
            );
        });
    });
});
