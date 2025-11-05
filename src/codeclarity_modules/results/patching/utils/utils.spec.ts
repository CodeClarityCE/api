import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatchingUtilsService } from './utils';
import { Result } from '../../result.entity';
import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';
import { Output as PatchesOutput } from '../patching.types';
import { Status } from 'src/types/apiResponses.types';

describe('PatchingUtilsService', () => {
    let service: PatchingUtilsService;
    let resultRepository: jest.Mocked<Repository<Result>>;

    const createMockPatchesOutput = (status: Status = Status.Success): PatchesOutput => ({
        workspaces: {
            default: {
                patches: {
                    'CVE-2023-1234': {
                        TopLevelVulnerable: true,
                        IsPatchable: 'yes',
                        Unpatchable: [],
                        Patchable: [],
                        Introduced: [],
                        Patches: {},
                        Update: {
                            Major: 1,
                            Minor: 2,
                            Patch: 3,
                            PreReleaseTag: '',
                            MetaData: ''
                        }
                    }
                },
                dev_patches: {}
            }
        },
        analysis_info: {
            status,
            public_errors: [],
            private_errors: [],
            analysis_start_time: '2024-01-01T00:00:00Z',
            analysis_end_time: '2024-01-01T01:00:00Z',
            analysis_delta_time: 3600,
            version_seperator: '.',
            import_path_seperator: '/',
            default_workspace_name: 'default',
            self_managed_workspace_name: 'self'
        }
    });

    const createMockResult = (patches: PatchesOutput): Partial<Result> => ({
        id: 'result-123',
        result: patches as any,
        plugin: 'js-patching',
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
                PatchingUtilsService,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockRepository
                }
            ]
        }).compile();

        service = module.get<PatchingUtilsService>(PatchingUtilsService);
        resultRepository = module.get(getRepositoryToken(Result, 'codeclarity'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getPatchingResult', () => {
        const analysisId = 'test-analysis-123';

        it('should return patches output when result exists and status is success', async () => {
            const mockPatchesOutput = createMockPatchesOutput(Status.Success);
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getPatchingResult(analysisId);

            expect(result).toEqual(mockPatchesOutput);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'js-patching'
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

            await expect(service.getPatchingResult(analysisId)).rejects.toThrow(
                PluginResultNotAvailable
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'js-patching'
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
            const mockPatchesOutput = createMockPatchesOutput(Status.Failure);
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getPatchingResult(analysisId)).rejects.toThrow(PluginFailed);

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'js-patching'
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

            await expect(service.getPatchingResult(analysisId)).rejects.toThrow(
                'Database connection failed'
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysisId
                    },
                    plugin: 'js-patching'
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
            const mockPatchesOutput = createMockPatchesOutput();
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getPatchingResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect((callArgs.where as any).plugin).toBe('js-patching');
        });

        it('should order by analysis created_on DESC', async () => {
            const mockPatchesOutput = createMockPatchesOutput();
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getPatchingResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect((callArgs.order as any).analysis.created_on).toBe('DESC');
        });

        it('should enable caching', async () => {
            const mockPatchesOutput = createMockPatchesOutput();
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getPatchingResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect(callArgs.cache).toBe(true);
        });

        it('should include analysis relation', async () => {
            const mockPatchesOutput = createMockPatchesOutput();
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getPatchingResult(analysisId);

            const callArgs = resultRepository.findOne.mock.calls[0]![0];
            expect((callArgs.relations as any).analysis).toBe(true);
        });

        it('should handle empty analysis ID', async () => {
            const mockPatchesOutput = createMockPatchesOutput();
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await service.getPatchingResult('');

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: ''
                    },
                    plugin: 'js-patching'
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
                ...createMockResult(createMockPatchesOutput()),
                result: undefined
            };

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getPatchingResult(analysisId)).rejects.toThrow();
        });

        it('should throw error when result data is malformed', async () => {
            const mockResult = {
                ...createMockResult(createMockPatchesOutput()),
                result: { invalid: 'data' }
            };

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getPatchingResult(analysisId)).rejects.toThrow();
        });

        it('should handle result with missing analysis_info', async () => {
            const mockPatchesOutput = {
                workspaces: {},
                analysis_info: undefined
            } as any;
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            await expect(service.getPatchingResult(analysisId)).rejects.toThrow();
        });

        it('should handle result with null analysis_info.status', async () => {
            const mockPatchesOutput = {
                ...createMockPatchesOutput(),
                analysis_info: {
                    ...createMockPatchesOutput().analysis_info,
                    status: null
                }
            } as any;
            const mockResult = createMockResult(mockPatchesOutput);

            resultRepository.findOne.mockResolvedValue(mockResult as unknown as Result);

            const result = await service.getPatchingResult(analysisId);

            expect(result).toEqual(mockPatchesOutput);
        });
    });

    describe('constructor', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should inject repository correctly', () => {
            expect(resultRepository).toBeDefined();
        });
    });
});
