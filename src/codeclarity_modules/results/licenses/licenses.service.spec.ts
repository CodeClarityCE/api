import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LicensesService } from './licenses.service';
import { AnalysisResultsService } from '../results.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/license/license.repository';
import { LicensesUtilsService } from './utils/utils';
import { SbomUtilsService } from '../sbom/utils/utils';
import { Result } from '../result.entity';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { UnknownWorkspace } from 'src/types/error.types';

describe('LicensesService', () => {
    let service: LicensesService;
    let analysisResultsService: AnalysisResultsService;
    let _licenseRepository: LicenseRepository;
    let licensesUtilsService: LicensesUtilsService;
    let sbomUtilsService: SbomUtilsService;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockLicensesOutput = {
        workspaces: {
            default: {
                LicensesDepMap: {
                    MIT: ['package1@1.0.0', 'package2@2.0.0'],
                    'Apache-2.0': ['package3@3.0.0']
                },
                NonSpdxLicensesDepMap: {
                    Custom: ['package4@4.0.0']
                },
                LicenseComplianceViolations: ['GPL-3.0']
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

    const mockLicenseData = {
        details: {
            name: 'MIT License',
            description: 'MIT License Description',
            classification: 'Permissive',
            licenseProperties: ['commercial-use', 'modifications'],
            seeAlso: ['https://opensource.org/licenses/MIT']
        }
    };

    const mockAnalysisResultsService = {
        checkAccess: jest.fn()
    };

    const mockLicenseRepository = {
        getLicenseData: jest.fn()
    };

    const mockLicensesUtilsService = {
        getLicensesResult: jest.fn()
    };

    const mockSbomUtilsService = {
        getSbomResult: jest.fn()
    };

    const mockResultRepository = {
        find: jest.fn(),
        findOne: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LicensesService,
                {
                    provide: AnalysisResultsService,
                    useValue: mockAnalysisResultsService
                },
                {
                    provide: LicenseRepository,
                    useValue: mockLicenseRepository
                },
                {
                    provide: LicensesUtilsService,
                    useValue: mockLicensesUtilsService
                },
                {
                    provide: SbomUtilsService,
                    useValue: mockSbomUtilsService
                },
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockResultRepository
                }
            ]
        }).compile();

        service = module.get<LicensesService>(LicensesService);
        analysisResultsService = module.get<AnalysisResultsService>(AnalysisResultsService);
        _licenseRepository = module.get<LicenseRepository>(LicenseRepository);
        licensesUtilsService = module.get<LicensesUtilsService>(LicensesUtilsService);
        sbomUtilsService = module.get<SbomUtilsService>(SbomUtilsService);

        jest.clearAllMocks();
    });

    describe('getLicensesUsed', () => {
        it('should return paginated licenses data', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockLicensesUtilsService.getLicensesResult.mockResolvedValue(mockLicensesOutput);
            mockLicenseRepository.getLicenseData.mockResolvedValue(mockLicenseData);

            const result = await service.getLicensesUsed(
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

            expect(result).toBeDefined();
            expect(result.data).toBeDefined();
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
            expect(licensesUtilsService.getLicensesResult).toHaveBeenCalledWith('analysis-123');
        });

        it('should handle active filters', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockLicensesUtilsService.getLicensesResult.mockResolvedValue(mockLicensesOutput);
            mockLicenseRepository.getLicenseData.mockResolvedValue(mockLicenseData);

            const result = await service.getLicensesUsed(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                0,
                20,
                'name',
                'asc',
                '[MIT,Apache-2.0]',
                'test'
            );

            expect(result).toBeDefined();
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
        });

        it('should throw error when checkAccess fails', async () => {
            const accessError = new Error('Access denied');
            mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

            await expect(
                service.getLicensesUsed(
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

    describe('getDependenciesUsingLicense', () => {
        it('should return dependencies using specific license', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockLicensesUtilsService.getLicensesResult.mockResolvedValue(mockLicensesOutput);
            mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

            // Mock the getDependencyVersions method to avoid "Not implemented" error
            jest.spyOn(service as any, 'getDependencyVersions').mockResolvedValue({});

            const result = await service.getDependenciesUsingLicense(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                'MIT'
            );

            expect(result).toBeDefined();
            expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
            expect(licensesUtilsService.getLicensesResult).toHaveBeenCalledWith('analysis-123');
            expect(sbomUtilsService.getSbomResult).toHaveBeenCalledWith('analysis-123');
        });

        it('should throw UnknownWorkspace error for invalid workspace', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockLicensesUtilsService.getLicensesResult.mockResolvedValue(mockLicensesOutput);
            mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

            await expect(
                service.getDependenciesUsingLicense(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    mockUser,
                    'invalid-workspace',
                    'MIT'
                )
            ).rejects.toThrow(UnknownWorkspace);
        });

        it('should handle access check failure', async () => {
            const accessError = new Error('Access denied');
            mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

            await expect(
                service.getDependenciesUsingLicense(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    mockUser,
                    'default',
                    'MIT'
                )
            ).rejects.toThrow('Access denied');
        });
    });

    describe('getStatus', () => {
        it('should return status with no errors', async () => {
            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockLicensesUtilsService.getLicensesResult.mockResolvedValue(mockLicensesOutput);

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

        it('should return status with errors', async () => {
            const outputWithErrors = {
                ...mockLicensesOutput,
                analysis_info: {
                    ...mockLicensesOutput.analysis_info,
                    public_errors: ['Public error'],
                    private_errors: ['Private error']
                }
            };

            mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
            mockLicensesUtilsService.getLicensesResult.mockResolvedValue(outputWithErrors);

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

    describe('getDependencyVersions (private method)', () => {
        it('should throw not implemented error', async () => {
            // Access private method through reflection for testing
            const getDependencyVersions = (service as any).getDependencyVersions;

            await expect(getDependencyVersions.call(service, ['package:1.0.0'])).rejects.toThrow(
                'Not implemented'
            );
        });
    });
});
