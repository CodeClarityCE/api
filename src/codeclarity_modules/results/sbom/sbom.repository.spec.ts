import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';

import { Result } from '../result.entity';

import { SBOMRepository } from './sbom.repository';
import { Status } from './sbom.types';


describe('SBOMRepository', () => {
    let repository: SBOMRepository;
    let resultRepository: any;

    const mockSbomOutput = {
        workspaces: {
            default: {
                dependencies: {
                    package1: {
                        '1.0.0': {
                            name: 'package1',
                            version: '1.0.0',
                            license: 'MIT',
                            Direct: true,
                            Transitive: false
                        }
                    },
                    package2: {
                        '2.0.0': {
                            name: 'package2',
                            version: '2.0.0',
                            license: 'Apache-2.0',
                            Direct: false,
                            Transitive: true
                        }
                    }
                },
                start: {
                    dependencies: ['package1@1.0.0'],
                    dev_dependencies: ['package2@2.0.0']
                }
            }
        },
        analysis_info: {
            status: Status.Success,
            package_manager: 'NPM',
            public_errors: [],
            private_errors: [],
            analysis_start_time: '2024-01-01T00:00:00Z',
            analysis_end_time: '2024-01-01T01:00:00Z'
        }
    };

    const mockResult = {
        id: 'result-123',
        plugin: 'js-sbom',
        result: mockSbomOutput,
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
                SBOMRepository,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockResultRepository
                }
            ]
        }).compile();

        repository = module.get<SBOMRepository>(SBOMRepository);
        resultRepository = module.get(getRepositoryToken(Result, 'codeclarity'));

        jest.clearAllMocks();
    });

    describe('getSbomResult', () => {
        it('should return SBOM output for successful analysis', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            const result = await repository.getSbomResult('analysis-123');

            expect(result).toEqual(mockSbomOutput);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'analysis-123'
                    },
                    plugin: In(['js-sbom', 'php-sbom'])
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

            await expect(repository.getSbomResult('non-existent-analysis')).rejects.toThrow(
                PluginResultNotAvailable
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'non-existent-analysis'
                    },
                    plugin: In(['js-sbom', 'php-sbom'])
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
                    ...mockSbomOutput,
                    analysis_info: {
                        ...mockSbomOutput.analysis_info,
                        status: Status.Failure
                    }
                }
            };
            mockResultRepository.findOne.mockResolvedValue(failedResult);

            await expect(repository.getSbomResult('analysis-123')).rejects.toThrow(PluginFailed);

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'analysis-123'
                    },
                    plugin: In(['js-sbom', 'php-sbom'])
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
                    ...mockSbomOutput,
                    analysis_info: {
                        ...mockSbomOutput.analysis_info,
                        status: Status.Success
                    }
                }
            };
            mockResultRepository.findOne.mockResolvedValue(successResult);

            const result = await repository.getSbomResult('analysis-123');

            expect(result).toEqual(successResult.result);
            expect(result.analysis_info.status).toBe(Status.Success);
        });

        it('should handle complex SBOM structure with multiple workspaces', async () => {
            const complexSbomOutput = {
                workspaces: {
                    frontend: {
                        dependencies: {
                            react: {
                                '18.0.0': {
                                    name: 'react',
                                    version: '18.0.0',
                                    license: 'MIT',
                                    Direct: true,
                                    Transitive: false
                                }
                            }
                        },
                        start: {
                            dependencies: ['react@18.0.0'],
                            dev_dependencies: []
                        }
                    },
                    backend: {
                        dependencies: {
                            express: {
                                '4.18.0': {
                                    name: 'express',
                                    version: '4.18.0',
                                    license: 'MIT',
                                    Direct: true,
                                    Transitive: false
                                }
                            }
                        },
                        start: {
                            dependencies: ['express@4.18.0'],
                            dev_dependencies: []
                        }
                    }
                },
                analysis_info: {
                    status: Status.Success,
                    package_manager: 'NPM',
                    public_errors: [],
                    private_errors: [],
                    analysis_start_time: '2024-01-01T00:00:00Z',
                    analysis_end_time: '2024-01-01T01:00:00Z'
                }
            };

            const complexResult = {
                ...mockResult,
                result: complexSbomOutput
            };
            mockResultRepository.findOne.mockResolvedValue(complexResult);

            const result = await repository.getSbomResult('analysis-123');

            expect(result).toEqual(complexSbomOutput);
            expect(Object.keys(result.workspaces)).toEqual(['frontend', 'backend']);
            expect((result.workspaces as any).frontend.dependencies.react['18.0.0'].name).toBe(
                'react'
            );
            expect((result.workspaces as any).backend.dependencies.express['4.18.0'].name).toBe(
                'express'
            );
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.findOne.mockRejectedValue(dbError);

            await expect(repository.getSbomResult('analysis-123')).rejects.toThrow(
                'Database connection failed'
            );
        });

        it('should use correct ordering and caching', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            await repository.getSbomResult('analysis-123');

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

            await repository.getSbomResult('analysis-123');

            expect(resultRepository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        plugin: In(['js-sbom', 'php-sbom'])
                    })
                })
            );
        });

        it('should include analysis relations', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            await repository.getSbomResult('analysis-123');

            expect(resultRepository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    relations: { analysis: true }
                })
            );
        });
    });
});
