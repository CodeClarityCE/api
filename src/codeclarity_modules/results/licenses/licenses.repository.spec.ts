import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Result } from '../result.entity';

import { LicensesRepository } from './licenses.repository';
import { Status } from './licenses.types';


describe('LicensesRepository', () => {
    let repository: LicensesRepository;
    let resultRepository: any;

    const mockLicensesOutput = {
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
            status: Status.Success,
            public_errors: [],
            private_errors: [],
            analysis_start_time: '2024-01-01T00:00:00Z',
            analysis_end_time: '2024-01-01T01:00:00Z'
        }
    };

    const mockResult = {
        id: 'result-123',
        plugin: 'js-license',
        result: mockLicensesOutput,
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
                LicensesRepository,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockResultRepository
                }
            ]
        }).compile();

        repository = module.get<LicensesRepository>(LicensesRepository);
        resultRepository = module.get(getRepositoryToken(Result, 'codeclarity'));

        jest.clearAllMocks();
    });

    describe('getLicensesResult', () => {
        it('should return licenses output for successful analysis', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            const result = await repository.getLicensesResult('analysis-123');

            expect(result).toEqual(mockLicensesOutput);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'analysis-123'
                    },
                    plugin: 'js-license'
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

            await expect(repository.getLicensesResult('non-existent-analysis')).rejects.toThrow(
                PluginResultNotAvailable
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'non-existent-analysis'
                    },
                    plugin: 'js-license'
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
                    ...mockLicensesOutput,
                    analysis_info: {
                        ...mockLicensesOutput.analysis_info,
                        status: Status.Failure
                    }
                }
            };
            mockResultRepository.findOne.mockResolvedValue(failedResult);

            await expect(repository.getLicensesResult('analysis-123')).rejects.toThrow(
                PluginFailed
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'analysis-123'
                    },
                    plugin: 'js-license'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should return result with Success status', async () => {
            const successResult = {
                ...mockResult,
                result: {
                    ...mockLicensesOutput,
                    analysis_info: {
                        ...mockLicensesOutput.analysis_info,
                        status: Status.Success
                    }
                }
            };
            mockResultRepository.findOne.mockResolvedValue(successResult);

            const result = await repository.getLicensesResult('analysis-123');

            expect(result).toEqual(successResult.result);
            expect(result.analysis_info.status).toBe(Status.Success);
        });

        it('should handle complex licenses output structure', async () => {
            const complexLicensesOutput = {
                workspaces: {
                    frontend: {
                        LicensesDepMap: {
                            MIT: ['react@18.0.0', 'lodash@4.17.21'],
                            ISC: ['semver@7.3.8']
                        },
                        NonSpdxLicensesDepMap: {
                            'Custom-License': ['custom-package@1.0.0']
                        },
                        LicenseComplianceViolations: ['GPL-3.0']
                    },
                    backend: {
                        LicensesDepMap: {
                            'Apache-2.0': ['express@4.18.0'],
                            MIT: ['typescript@4.9.0']
                        },
                        NonSpdxLicensesDepMap: {},
                        LicenseComplianceViolations: []
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
                result: complexLicensesOutput
            };
            mockResultRepository.findOne.mockResolvedValue(complexResult);

            const result = await repository.getLicensesResult('analysis-123');

            expect(result).toEqual(complexLicensesOutput);
            expect(Object.keys(result.workspaces)).toEqual(['frontend', 'backend']);
            expect(result.workspaces['frontend']!.LicensesDepMap['MIT']).toContain('react@18.0.0');
            expect(result.workspaces['backend']!.LicenseComplianceViolations).toHaveLength(0);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.findOne.mockRejectedValue(dbError);

            await expect(repository.getLicensesResult('analysis-123')).rejects.toThrow(
                'Database connection failed'
            );
        });

        it('should use correct ordering and caching', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            await repository.getLicensesResult('analysis-123');

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

            await repository.getLicensesResult('analysis-123');

            expect(resultRepository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        plugin: 'js-license'
                    })
                })
            );
        });
    });
});
