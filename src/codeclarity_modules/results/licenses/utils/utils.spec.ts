import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LicensesUtilsService } from './utils';
import { Result } from '../../result.entity';
import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';
import { Output as LicensesOutput } from '../licenses.types';
import { Status } from 'src/types/apiResponses.types';

describe('LicensesUtilsService', () => {
    let service: LicensesUtilsService;
    let resultRepository: jest.Mocked<Repository<Result>>;

    const createMockLicensesOutput = (status: Status = Status.Success): LicensesOutput => ({
        workspaces: {
            default: {
                LicensesDepMap: {
                    MIT: ['dep1', 'dep2'],
                    'Apache-2.0': ['dep3']
                },
                NonSpdxLicensesDepMap: {
                    'Custom-License': ['dep4']
                },
                LicenseComplianceViolations: ['GPL-2.0'],
                DependencyInfo: {
                    dep1: {
                        Licenses: ['MIT'],
                        NonSpdxLicenses: []
                    },
                    dep2: {
                        Licenses: ['MIT'],
                        NonSpdxLicenses: []
                    },
                    dep3: {
                        Licenses: ['Apache-2.0'],
                        NonSpdxLicenses: []
                    },
                    dep4: {
                        Licenses: [],
                        NonSpdxLicenses: ['Custom-License']
                    }
                }
            }
        },
        analysis_info: {
            status,
            private_errors: [],
            public_errors: [],
            analysis_start_time: '2024-01-01T00:00:00Z',
            analysis_end_time: '2024-01-01T01:00:00Z',
            analysis_delta_time: 3600,
            version_seperator: '.',
            import_path_seperator: '/',
            default_workspace_name: 'default',
            self_managed_workspace_name: 'self',
            stats: {
                number_of_spdx_licenses: 2,
                number_of_non_spdx_licenses: 1,
                number_of_copy_left_licenses: 1,
                number_of_permissive_licenses: 2,
                license_dist: {
                    MIT: 2,
                    'Apache-2.0': 1,
                    'Custom-License': 1
                }
            }
        }
    });

    const createMockResult = (licenses: LicensesOutput): Partial<Result> => ({
        id: 'result-123',
        result: licenses as any,
        plugin: 'js-license',
        analysis: {
            id: 'analysis-123',
            created_on: new Date('2024-01-01T00:00:00Z')
        } as any
    });

    beforeEach(async () => {
        const mockRepository = {
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LicensesUtilsService,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockRepository
                }
            ]
        }).compile();

        service = module.get<LicensesUtilsService>(LicensesUtilsService);
        resultRepository = module.get(getRepositoryToken(Result, 'codeclarity'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getLicensesResult', () => {
        const analysisId = 'test-analysis-123';

        it('should return licenses output when result exists and status is success', async () => {
            const mockLicensesOutput = createMockLicensesOutput(Status.Success);
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should throw PluginResultNotAvailable when no result is found', async () => {
            resultRepository.findOne.mockResolvedValue(null);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow(
                PluginResultNotAvailable
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should throw PluginFailed when result status is failure', async () => {
            const mockLicensesOutput = createMockLicensesOutput(Status.Failure);
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow(PluginFailed);

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should handle repository errors', async () => {
            const repositoryError = new Error('Database connection failed');
            resultRepository.findOne.mockRejectedValue(repositoryError);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow(
                'Database connection failed'
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should use correct plugin name in query', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getLicensesResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect((callArgs.where as any).plugin).toBe('license-finder');
        });

        it('should order by analysis created_on DESC', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getLicensesResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect((callArgs.order as any).analysis.created_on).toBe('DESC');
        });

        it('should enable caching', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getLicensesResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect(callArgs.cache).toBe(true);
        });

        it('should include analysis relation', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getLicensesResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect((callArgs.relations as any).analysis).toBe(true);
        });

        it('should handle empty analysis ID', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getLicensesResult('');

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: ''
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should handle null analysis ID', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getLicensesResult(null as any);

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: null
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should handle undefined analysis ID', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getLicensesResult(undefined as any);

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: undefined
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should throw error when result.result field is undefined', async () => {
            const mockResult = {
                ...createMockResult(createMockLicensesOutput()),
                result: undefined
            };

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow();
        });

        it('should throw error when result.result field is null', async () => {
            const mockResult = {
                ...createMockResult(createMockLicensesOutput()),
                result: null
            };

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow();
        });

        it('should throw error when result data is malformed', async () => {
            const mockResult = {
                ...createMockResult(createMockLicensesOutput()),
                result: { invalid: 'data' }
            };

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow();
        });

        it('should handle result with missing analysis_info', async () => {
            const mockLicensesOutput = {
                workspaces: {},
                analysis_info: undefined
            } as any;
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow();
        });

        it('should handle result with null analysis_info', async () => {
            const mockLicensesOutput = {
                workspaces: {},
                analysis_info: null
            } as any;
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow();
        });

        it('should handle result with null analysis_info.status', async () => {
            const mockLicensesOutput = {
                ...createMockLicensesOutput(),
                analysis_info: {
                    ...createMockLicensesOutput().analysis_info,
                    status: null
                }
            } as any;
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
        });

        it('should handle result with undefined analysis_info.status', async () => {
            const mockLicensesOutput = {
                ...createMockLicensesOutput(),
                analysis_info: {
                    ...createMockLicensesOutput().analysis_info,
                    status: undefined
                }
            } as any;
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
        });

        it('should handle result with empty workspaces', async () => {
            const mockLicensesOutput = {
                ...createMockLicensesOutput(),
                workspaces: {}
            };
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(result.workspaces).toEqual({});
        });

        it('should handle result with null workspaces', async () => {
            const mockLicensesOutput = {
                ...createMockLicensesOutput(),
                workspaces: null
            } as any;
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(result.workspaces).toEqual(null);
        });

        it('should handle result with complex workspace structure', async () => {
            const mockLicensesOutput: LicensesOutput = {
                workspaces: {
                    default: {
                        LicensesDepMap: {
                            MIT: ['dep1', 'dep2'],
                            'Apache-2.0': ['dep3'],
                            'GPL-2.0': ['dep4']
                        },
                        NonSpdxLicensesDepMap: {
                            'Custom-License-1': ['dep5'],
                            'Custom-License-2': ['dep6']
                        },
                        LicenseComplianceViolations: ['GPL-2.0', 'AGPL-3.0'],
                        DependencyInfo: {
                            dep1: {
                                Licenses: ['MIT'],
                                NonSpdxLicenses: []
                            },
                            dep2: {
                                Licenses: ['MIT', 'Apache-2.0'],
                                NonSpdxLicenses: []
                            },
                            dep3: {
                                Licenses: ['Apache-2.0'],
                                NonSpdxLicenses: []
                            },
                            dep4: {
                                Licenses: ['GPL-2.0'],
                                NonSpdxLicenses: []
                            },
                            dep5: {
                                Licenses: [],
                                NonSpdxLicenses: ['Custom-License-1']
                            },
                            dep6: {
                                Licenses: [],
                                NonSpdxLicenses: ['Custom-License-2']
                            }
                        }
                    },
                    'workspace-2': {
                        LicensesDepMap: {
                            'BSD-3-Clause': ['dep7']
                        },
                        NonSpdxLicensesDepMap: {},
                        LicenseComplianceViolations: [],
                        DependencyInfo: {
                            dep7: {
                                Licenses: ['BSD-3-Clause'],
                                NonSpdxLicenses: []
                            }
                        }
                    }
                },
                analysis_info: {
                    status: Status.Success,
                    private_errors: [],
                    public_errors: [],
                    analysis_start_time: '2024-01-01T00:00:00Z',
                    analysis_end_time: '2024-01-01T01:00:00Z',
                    analysis_delta_time: 3600,
                    version_seperator: '.',
                    import_path_seperator: '/',
                    default_workspace_name: 'default',
                    self_managed_workspace_name: 'self',
                    stats: {
                        number_of_spdx_licenses: 4,
                        number_of_non_spdx_licenses: 2,
                        number_of_copy_left_licenses: 1,
                        number_of_permissive_licenses: 3,
                        license_dist: {
                            MIT: 2,
                            'Apache-2.0': 1,
                            'GPL-2.0': 1,
                            'BSD-3-Clause': 1,
                            'Custom-License-1': 1,
                            'Custom-License-2': 1
                        }
                    }
                }
            };
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(Object.keys(result.workspaces)).toEqual(['default', 'workspace-2']);
        });

        it('should handle result with errors in analysis_info', async () => {
            const mockLicensesOutput = {
                ...createMockLicensesOutput(),
                analysis_info: {
                    ...createMockLicensesOutput().analysis_info,
                    private_errors: ['Private error 1', 'Private error 2'],
                    public_errors: ['Public error 1']
                }
            };
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(result.analysis_info.private_errors).toEqual([
                'Private error 1',
                'Private error 2'
            ]);
            expect(result.analysis_info.public_errors).toEqual(['Public error 1']);
        });

        it('should handle result with zero stats', async () => {
            const mockLicensesOutput = {
                ...createMockLicensesOutput(),
                analysis_info: {
                    ...createMockLicensesOutput().analysis_info,
                    stats: {
                        number_of_spdx_licenses: 0,
                        number_of_non_spdx_licenses: 0,
                        number_of_copy_left_licenses: 0,
                        number_of_permissive_licenses: 0,
                        license_dist: {}
                    }
                }
            };
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(analysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(result.analysis_info.stats.number_of_spdx_licenses).toBe(0);
            expect(result.analysis_info.stats.license_dist).toEqual({});
        });

        it('should handle concurrent requests', async () => {
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const promises = [
                service.getLicensesResult(analysisId),
                service.getLicensesResult(analysisId),
                service.getLicensesResult(analysisId)
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach((result) => {
                expect(result).toEqual(mockLicensesOutput);
            });
            expect(resultRepository.findOne).toHaveBeenCalledTimes(3);
        });

        it('should handle database timeout errors', async () => {
            const timeoutError = new Error('Connection timeout');
            timeoutError.name = 'ConnectionTimeoutError';
            resultRepository.findOne.mockRejectedValue(timeoutError);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow(
                'Connection timeout'
            );
        });

        it('should handle database constraint errors', async () => {
            const constraintError = new Error('Foreign key constraint failed');
            constraintError.name = 'ConstraintError';
            resultRepository.findOne.mockRejectedValue(constraintError);

            await expect(service.getLicensesResult(analysisId)).rejects.toThrow(
                'Foreign key constraint failed'
            );
        });

        it('should handle very long analysis IDs', async () => {
            const longAnalysisId = 'a'.repeat(1000);
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(longAnalysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: longAnalysisId
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should handle analysis IDs with special characters', async () => {
            const specialAnalysisId = 'analysis-!@#$%^&*()_+-=[]{}|;:,.<>?';
            const mockLicensesOutput = createMockLicensesOutput();
            const mockResult = createMockResult(mockLicensesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getLicensesResult(specialAnalysisId);

            expect(result).toEqual(mockLicensesOutput);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: specialAnalysisId
                    },
                    plugin: 'license-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });
    });

    describe('constructor', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should inject repository correctly', () => {
            expect(resultRepository).toBeDefined();
        });

        it('should have getLicensesResult method', () => {
            expect(service.getLicensesResult).toBeDefined();
            expect(typeof service.getLicensesResult).toBe('function');
        });
    });

    describe('service configuration', () => {
        it('should use correct database connection', () => {
            const repositoryToken = getRepositoryToken(Result, 'codeclarity');
            expect(repositoryToken).toBeDefined();
        });

        it('should be injectable', () => {
            expect(service).toBeInstanceOf(LicensesUtilsService);
        });
    });
});
