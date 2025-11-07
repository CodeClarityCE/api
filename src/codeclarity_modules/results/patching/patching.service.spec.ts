import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { UnknownWorkspace } from 'src/types/error.types';
import { Result } from '../result.entity';
import { AnalysisResultsService } from '../results.service';
import { SbomUtilsService } from '../sbom/utils/utils';
import { VulnerabilitiesUtilsService } from '../vulnerabilities/utils/utils.service';
import { PatchingService } from './patching.service';
import { PatchingUtilsService } from './utils/utils';

describe('PatchingService', () => {
    let service: PatchingService;
    let analysisResultsService: AnalysisResultsService;
    let patchingUtilsService: PatchingUtilsService;
    let sbomUtilsService: SbomUtilsService;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockPatchesOutput = {
        workspaces: {
            default: {
                vulnerability_patch_info: {},
                patches: {}
            }
        },
        analysis_info: {
            public_errors: [],
            private_errors: [],
            analysis_start_time: '2024-01-01T00:00:00Z',
            analysis_end_time: '2024-01-01T01:00:00Z'
        }
    };

    const mockSbomOutput = {
        analysis_info: {
            package_manager: 'NPM'
        }
    };

    const mockAnalysisResultsService = {
        checkAccess: jest.fn()
    };

    const mockPatchingUtilsService = {
        getPatchingResult: jest.fn()
    };

    const mockSbomUtilsService = {
        getSbomResult: jest.fn()
    };

    const mockVulnerabilitiesUtilsService = {
        getVulnsResult: jest.fn()
    };

    const mockResultRepository = {
        find: jest.fn(),
        findOne: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PatchingService,
                {
                    provide: AnalysisResultsService,
                    useValue: mockAnalysisResultsService
                },
                {
                    provide: PatchingUtilsService,
                    useValue: mockPatchingUtilsService
                },
                {
                    provide: SbomUtilsService,
                    useValue: mockSbomUtilsService
                },
                {
                    provide: VulnerabilitiesUtilsService,
                    useValue: mockVulnerabilitiesUtilsService
                },
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockResultRepository
                }
            ]
        }).compile();

        service = module.get<PatchingService>(PatchingService);
        analysisResultsService = module.get<AnalysisResultsService>(AnalysisResultsService);
        patchingUtilsService = module.get<PatchingUtilsService>(PatchingUtilsService);
        sbomUtilsService = module.get<SbomUtilsService>(SbomUtilsService);

        jest.clearAllMocks();
    });

    describe('getPatches', () => {
        it('should return patches for valid workspace', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);

            const result = await service.getPatches(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'name',
                'asc',
                undefined,
                undefined
            );

            expect(result).toEqual(mockPatchesOutput.workspaces.default);
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
            expect(patchingUtilsService.getPatchingResult).toHaveBeenCalledWith('analysis-123');
        });

        it('should throw UnknownWorkspace for invalid workspace', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);

            await expect(
                service.getPatches(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    mockUser,
                    'invalid-workspace',
                    0,
                    20,
                    'name',
                    'asc',
                    undefined,
                    undefined
                )
            ).rejects.toThrow(UnknownWorkspace);
        });

        it('should handle access check failure', async () => {
            const accessError = new Error('Access denied');
            mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

            await expect(
                service.getPatches(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    mockUser,
                    'default',
                    0,
                    20,
                    'name',
                    'asc',
                    undefined,
                    undefined
                )
            ).rejects.toThrow('Access denied');
        });
    });

    describe('getPatchedManifest', () => {
        it('should return analysis info for npm package manager', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);
            mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

            const result = await service.getPatchedManifest(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result).toEqual(mockSbomOutput.analysis_info);
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
            expect(patchingUtilsService.getPatchingResult).toHaveBeenCalledWith('analysis-123');
            expect(sbomUtilsService.getSbomResult).toHaveBeenCalledWith('analysis-123');
        });

        it('should return analysis info for yarn package manager', async () => {
            const yarnSbomOutput = {
                analysis_info: {
                    package_manager: 'YARN'
                }
            };

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);
            mockSbomUtilsService.getSbomResult.mockResolvedValue(yarnSbomOutput);

            const result = await service.getPatchedManifest(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result).toEqual(yarnSbomOutput.analysis_info);
        });

        it('should return empty object for unsupported package manager', async () => {
            const unsupportedSbomOutput = {
                analysis_info: {
                    package_manager: 'MAVEN'
                }
            };

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);
            mockSbomUtilsService.getSbomResult.mockResolvedValue(unsupportedSbomOutput);

            const result = await service.getPatchedManifest(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result).toEqual({});
        });

        it('should throw UnknownWorkspace for invalid workspace', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);

            await expect(
                service.getPatchedManifest(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    mockUser,
                    'invalid-workspace'
                )
            ).rejects.toThrow(UnknownWorkspace);
        });
    });

    describe('getStats', () => {
        it('should return analysis stats for valid workspace', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);

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
            expect(patchingUtilsService.getPatchingResult).toHaveBeenCalledWith('analysis-123');
        });

        it('should throw UnknownWorkspace for invalid workspace', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);

            await expect(
                service.getStats(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    mockUser,
                    'invalid-workspace'
                )
            ).rejects.toThrow(UnknownWorkspace);
        });

        it('should handle access check failure', async () => {
            const accessError = new Error('Access denied');
            mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

            await expect(
                service.getStats('org-123', 'project-123', 'analysis-123', mockUser, 'default')
            ).rejects.toThrow('Access denied');
        });
    });

    describe('getStatus', () => {
        it('should return status with no errors', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(mockPatchesOutput);

            const result = await service.getStatus(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );

            expect(result).toEqual({
                public_errors: [],
                private_errors: [],
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
                ...mockPatchesOutput,
                analysis_info: {
                    ...mockPatchesOutput.analysis_info,
                    public_errors: ['Public error'],
                    private_errors: ['Private error']
                }
            };

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockPatchingUtilsService.getPatchingResult.mockResolvedValue(outputWithErrors);

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
