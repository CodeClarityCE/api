import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SbomUtilsService } from './utils';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { VulnerabilitiesUtilsService } from '../../vulnerabilities/utils/utils.service';
import { LicensesUtilsService } from '../../licenses/utils/utils';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/package/package.repository';
import { 
    Status, 
    Output as SBOMOutput,
    Dependency,
    DependencyDetails,
    SbomDependency 
} from '../sbom.types';
import { Output as VulnsOutput } from '../../vulnerabilities/vulnerabilities.types';
import { PluginFailed, PluginResultNotAvailable, UnknownWorkspace } from 'src/types/error.types';
import { Source, Package } from 'src/codeclarity_modules/knowledge/package/package.entity';

describe('SbomUtilsService', () => {
    let service: SbomUtilsService;
    let resultRepository: jest.Mocked<Repository<Result>>;
    let vulnerabilitiesUtilsService: jest.Mocked<VulnerabilitiesUtilsService>;
    let licensesUtilsService: jest.Mocked<LicensesUtilsService>;
    let packageRepository: jest.Mocked<PackageRepository>;

    const mockAnalysisId = 'test-analysis-id';
    const mockWorkspace = 'test-workspace';

    const createMockSBOMOutput = (overrides: Partial<SBOMOutput> = {}): SBOMOutput => ({
        workspaces: {
            [mockWorkspace]: {
                dependencies: {
                    'test-package': {
                        '1.0.0': {
                            Key: 'test-package@1.0.0',
                            Requires: { 'other-package': '^1.0.0' },
                            Dependencies: { 'other-package': '1.0.0' },
                            Optional: false,
                            Bundled: false,
                            Dev: false,
                            Prod: true,
                            Direct: true,
                            Transitive: false,
                            Licenses: ['MIT']
                        }
                    }
                },
                start: {
                    dependencies: [{
                        name: 'test-package',
                        version: '1.0.0',
                        constraint: '^1.0.0'
                    }]
                }
            }
        },
        analysis_info: {
            status: Status.Success,
            private_errors: [],
            public_errors: [],
            project_name: 'test-project',
            working_directory: '/path/to/project',
            package_manager: 'npm',
            lock_file_version: 1,
            lock_file_path: '/path/to/package-lock.json',
            package_file_path: '/path/to/package.json',
            relative_lock_file_path: 'package-lock.json',
            relative_package_file_path: 'package.json',
            analysis_start_time: '2023-01-01T00:00:00Z',
            analysis_end_time: '2023-01-01T00:01:00Z',
            analysis_delta_time: 60000,
            version_seperator: '@',
            import_path_seperator: '/',
            default_workspace_name: 'default',
            self_managed_workspace_name: 'self',
            work_spaces_used: false,
            work_space_package_file_paths: {},
            stats: {}
        },
        ...overrides
    });

    const createMockVulnsOutput = (): VulnsOutput => ({
        workspaces: {
            '.': {
                Vulnerabilities: [
                    {
                        VulnerabilityId: 'CVE-2023-1234',
                        AffectedDependency: 'test-package',
                        AffectedVersion: '1.0.0',
                        Severity: {
                            SeverityClass: 'HIGH',
                            Severity: 8.0
                        }
                    }
                ]
            }
        }
    } as any);

    const createMockResult = (sbom: SBOMOutput): Result => ({
        id: 'result-id',
        plugin: 'js-sbom',
        result: sbom as any,
        analysis: {
            id: mockAnalysisId,
            created_on: new Date('2023-01-01T00:00:00Z')
        }
    } as any);

    beforeEach(async () => {
        const mockResultRepository = {
            findOne: jest.fn()
        };

        const mockVulnerabilitiesUtilsService = {
            getVulnsResult: jest.fn()
        };

        const mockLicensesUtilsService = {};

        const mockPackageRepository = {
            getVersionInfo: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SbomUtilsService,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockResultRepository
                },
                {
                    provide: VulnerabilitiesUtilsService,
                    useValue: mockVulnerabilitiesUtilsService
                },
                {
                    provide: LicensesUtilsService,
                    useValue: mockLicensesUtilsService
                },
                {
                    provide: PackageRepository,
                    useValue: mockPackageRepository
                }
            ]
        }).compile();

        service = module.get<SbomUtilsService>(SbomUtilsService);
        resultRepository = module.get(getRepositoryToken(Result, 'codeclarity'));
        vulnerabilitiesUtilsService = module.get(VulnerabilitiesUtilsService);
        licensesUtilsService = module.get(LicensesUtilsService);
        packageRepository = module.get(PackageRepository);
    });

    describe('getSbomData', () => {
        it('should return empty array when SBOM is successfully retrieved', async () => {
            const mockSBOM = createMockSBOMOutput();
            resultRepository.findOne.mockResolvedValue(createMockResult(mockSBOM));

            const result = await service.getSbomData(mockAnalysisId, mockWorkspace);

            expect(result).toEqual([]);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: { id: mockAnalysisId },
                    plugin: 'js-sbom'
                },
                order: { analysis: { created_on: 'DESC' } },
                cache: true
            });
        });

        it('should throw UnknownWorkspace when workspace does not exist', async () => {
            const mockSBOM = createMockSBOMOutput();
            resultRepository.findOne.mockResolvedValue(createMockResult(mockSBOM));

            await expect(
                service.getSbomData(mockAnalysisId, 'nonexistent-workspace')
            ).rejects.toThrow(UnknownWorkspace);
        });

        it('should throw PluginResultNotAvailable when result is not found', async () => {
            resultRepository.findOne.mockResolvedValue(null);

            await expect(
                service.getSbomData(mockAnalysisId, mockWorkspace)
            ).rejects.toThrow(PluginResultNotAvailable);
        });

        it('should throw PluginFailed when SBOM status is failure', async () => {
            const mockSBOM = createMockSBOMOutput({
                analysis_info: {
                    ...createMockSBOMOutput().analysis_info,
                    status: Status.Failure
                }
            });
            resultRepository.findOne.mockResolvedValue(createMockResult(mockSBOM));

            await expect(
                service.getSbomData(mockAnalysisId, mockWorkspace)
            ).rejects.toThrow(PluginFailed);
        });
    });

    describe('getSbomResult', () => {
        it('should return SBOM output when result is found and status is success', async () => {
            const mockSBOM = createMockSBOMOutput();
            resultRepository.findOne.mockResolvedValue(createMockResult(mockSBOM));

            const result = await service.getSbomResult(mockAnalysisId);

            expect(result).toEqual(mockSBOM);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: { id: mockAnalysisId },
                    plugin: 'js-sbom'
                },
                order: { analysis: { created_on: 'DESC' } },
                cache: true
            });
        });

        it('should throw PluginResultNotAvailable when result is not found', async () => {
            resultRepository.findOne.mockResolvedValue(null);

            await expect(service.getSbomResult(mockAnalysisId)).rejects.toThrow(PluginResultNotAvailable);
        });

        it('should throw PluginFailed when SBOM status is failure', async () => {
            const mockSBOM = createMockSBOMOutput({
                analysis_info: {
                    ...createMockSBOMOutput().analysis_info,
                    status: Status.Failure
                }
            });
            resultRepository.findOne.mockResolvedValue(createMockResult(mockSBOM));

            await expect(service.getSbomResult(mockAnalysisId)).rejects.toThrow(PluginFailed);
        });

        it('should use correct query parameters', async () => {
            const mockSBOM = createMockSBOMOutput();
            resultRepository.findOne.mockResolvedValue(createMockResult(mockSBOM));

            await service.getSbomResult(mockAnalysisId);

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: { id: mockAnalysisId },
                    plugin: 'js-sbom'
                },
                order: { analysis: { created_on: 'DESC' } },
                cache: true
            });
        });
    });

    describe('getDependencyData', () => {
        const dependencyName = 'test-package';
        const dependencyVersion = '1.0.0';

        const createMockPackageVersionInfo = (): Package => ({
            id: 'test-package-id',
            name: 'test-package',
            description: 'A test package',
            homepage: 'https://test.com',
            repository: 'https://github.com/test/test',
            latest_version: '1.1.0',
            license: 'MIT',
            licenses: [{ type: 'MIT', url: 'https://opensource.org/licenses/MIT' }],
            source: { type: 'npm', url: 'https://npmjs.com/package/test-package' },
            time: new Date('2023-01-15T00:00:00Z'),
            keywords: ['test'],
            extra: {},
            versions: [{
                version: '1.0.0',
                dependencies: { 'lodash': '^4.0.0' },
                dev_dependencies: { 'jest': '^29.0.0' },
                extra: {
                    Engines: { node: '>=14.0.0' },
                    Time: new Date('2023-01-01T00:00:00Z')
                }
            }] as any
        } as Package);

        it('should return dependency details with vulnerability information', async () => {
            const mockSBOM = createMockSBOMOutput();
            const mockVulns = createMockVulnsOutput();
            const mockPackageInfo = createMockPackageVersionInfo();

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockResolvedValue(mockVulns);

            const result = await service.getDependencyData(
                mockAnalysisId,
                mockWorkspace,
                dependencyName,
                dependencyVersion,
                mockSBOM
            );

            expect(result).toEqual({
                name: dependencyName,
                version: '1.0.0',
                latest_version: '1.1.0',
                dependencies: { 'lodash': '^4.0.0' },
                dev_dependencies: { 'jest': '^29.0.0' },
                transitive: false,
                source: { type: 'npm', url: 'https://npmjs.com/package/test-package' },
                package_manager: 'npm',
                license: 'MIT',
                engines: { node: '>=14.0.0' },
                release_date: new Date('2023-01-01T00:00:00Z'),
                lastest_release_date: new Date('2023-01-15T00:00:00Z'),
                vulnerabilities: ['CVE-2023-1234'],
                severity_dist: {
                    critical: 0,
                    high: 1,
                    medium: 0,
                    low: 0,
                    none: 0
                }
            });

            expect(packageRepository.getVersionInfo).toHaveBeenCalledWith(
                dependencyName,
                dependencyVersion
            );
            expect(vulnerabilitiesUtilsService.getVulnsResult).toHaveBeenCalledWith(mockAnalysisId);
        });

        it('should handle dependencies without vulnerabilities', async () => {
            const mockSBOM = createMockSBOMOutput();
            const mockVulns = {
                workspaces: {
                    '.': {
                        Vulnerabilities: []
                    }
                }
            } as any;
            const mockPackageInfo = createMockPackageVersionInfo();

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockResolvedValue(mockVulns);

            const result = await service.getDependencyData(
                mockAnalysisId,
                mockWorkspace,
                dependencyName,
                dependencyVersion,
                mockSBOM
            );

            expect(result.vulnerabilities).toEqual([]);
            expect(result.severity_dist).toEqual({
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                none: 0
            });
        });

        it('should correctly count vulnerabilities by severity', async () => {
            const mockSBOM = createMockSBOMOutput();
            const mockVulns = {
                workspaces: {
                    '.': {
                        Vulnerabilities: [
                            {
                                VulnerabilityId: 'CVE-2023-1001',
                                AffectedDependency: dependencyName,
                                AffectedVersion: dependencyVersion,
                                Severity: { SeverityClass: 'CRITICAL' }
                            },
                            {
                                VulnerabilityId: 'CVE-2023-1002',
                                AffectedDependency: dependencyName,
                                AffectedVersion: dependencyVersion,
                                Severity: { SeverityClass: 'HIGH' }
                            },
                            {
                                VulnerabilityId: 'CVE-2023-1003',
                                AffectedDependency: dependencyName,
                                AffectedVersion: dependencyVersion,
                                Severity: { SeverityClass: 'MEDIUM' }
                            },
                            {
                                VulnerabilityId: 'CVE-2023-1004',
                                AffectedDependency: dependencyName,
                                AffectedVersion: dependencyVersion,
                                Severity: { SeverityClass: 'LOW' }
                            },
                            {
                                VulnerabilityId: 'CVE-2023-1005',
                                AffectedDependency: dependencyName,
                                AffectedVersion: dependencyVersion,
                                Severity: { SeverityClass: 'NONE' }
                            }
                        ]
                    }
                }
            } as any;
            const mockPackageInfo = createMockPackageVersionInfo();

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockResolvedValue(mockVulns);

            const result = await service.getDependencyData(
                mockAnalysisId,
                mockWorkspace,
                dependencyName,
                dependencyVersion,
                mockSBOM
            );

            expect(result.vulnerabilities).toEqual([
                'CVE-2023-1001',
                'CVE-2023-1002',
                'CVE-2023-1003',
                'CVE-2023-1004',
                'CVE-2023-1005'
            ]);
            expect(result.severity_dist).toEqual({
                critical: 1,
                high: 1,
                medium: 1,
                low: 1,
                none: 1
            });
        });

        it('should filter vulnerabilities for specific dependency and version', async () => {
            const mockSBOM = createMockSBOMOutput();
            const mockVulns = {
                workspaces: {
                    '.': {
                        Vulnerabilities: [
                            {
                                VulnerabilityId: 'CVE-2023-1001',
                                AffectedDependency: dependencyName,
                                AffectedVersion: dependencyVersion,
                                Severity: { SeverityClass: 'HIGH' }
                            },
                            {
                                VulnerabilityId: 'CVE-2023-1002',
                                AffectedDependency: 'other-package',
                                AffectedVersion: '2.0.0',
                                Severity: { SeverityClass: 'CRITICAL' }
                            },
                            {
                                VulnerabilityId: 'CVE-2023-1003',
                                AffectedDependency: dependencyName,
                                AffectedVersion: '2.0.0',
                                Severity: { SeverityClass: 'MEDIUM' }
                            }
                        ]
                    }
                }
            } as any;
            const mockPackageInfo = createMockPackageVersionInfo();

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockResolvedValue(mockVulns);

            const result = await service.getDependencyData(
                mockAnalysisId,
                mockWorkspace,
                dependencyName,
                dependencyVersion,
                mockSBOM
            );

            expect(result.vulnerabilities).toEqual(['CVE-2023-1001']);
            expect(result.severity_dist).toEqual({
                critical: 0,
                high: 1,
                medium: 0,
                low: 0,
                none: 0
            });
        });

        it('should handle transitive dependencies correctly', async () => {
            const mockSBOM = createMockSBOMOutput();
            mockSBOM.workspaces[mockWorkspace].dependencies[dependencyName][dependencyVersion].Transitive = true;
            
            const mockVulns = createMockVulnsOutput();
            const mockPackageInfo = createMockPackageVersionInfo();

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockResolvedValue(mockVulns);

            const result = await service.getDependencyData(
                mockAnalysisId,
                mockWorkspace,
                dependencyName,
                dependencyVersion,
                mockSBOM
            );

            expect(result.transitive).toBe(true);
        });

        it('should handle missing dependency in SBOM', async () => {
            const mockSBOM = createMockSBOMOutput();
            const mockVulns = createMockVulnsOutput();
            const mockPackageInfo = createMockPackageVersionInfo();

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockResolvedValue(mockVulns);

            await expect(
                service.getDependencyData(
                    mockAnalysisId,
                    mockWorkspace,
                    'nonexistent-package',
                    '1.0.0',
                    mockSBOM
                )
            ).rejects.toThrow();
        });

        it('should handle missing version in SBOM', async () => {
            const mockSBOM = createMockSBOMOutput();
            const mockVulns = createMockVulnsOutput();
            const mockPackageInfo = createMockPackageVersionInfo();

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockResolvedValue(mockVulns);

            await expect(
                service.getDependencyData(
                    mockAnalysisId,
                    mockWorkspace,
                    dependencyName,
                    '2.0.0',
                    mockSBOM
                )
            ).rejects.toThrow();
        });
    });

    describe('error handling', () => {
        it('should propagate repository errors', async () => {
            const error = new Error('Database connection failed');
            resultRepository.findOne.mockRejectedValue(error);

            await expect(service.getSbomResult(mockAnalysisId)).rejects.toThrow(error);
        });

        it('should propagate vulnerabilities service errors', async () => {
            const mockSBOM = createMockSBOMOutput();
            const mockPackageInfo = {
                id: 'test-package-id',
                name: 'test-package',
                description: 'A test package',
                homepage: 'https://test.com',
                repository: 'https://github.com/test/test',
                latest_version: '1.1.0',
                license: 'MIT',
                licenses: [{ type: 'MIT', url: 'https://opensource.org/licenses/MIT' }],
                source: { type: 'npm', url: 'https://npmjs.com/package/test-package' },
                time: new Date(),
                keywords: ['test'],
                extra: {},
                versions: [{ version: '1.0.0', dependencies: {}, dev_dependencies: {}, extra: { Engines: {}, Time: new Date() } }] as any
            } as any;
            const error = new Error('Vulnerabilities service failed');

            packageRepository.getVersionInfo.mockResolvedValue(mockPackageInfo);
            vulnerabilitiesUtilsService.getVulnsResult.mockRejectedValue(error);

            await expect(
                service.getDependencyData(
                    mockAnalysisId,
                    mockWorkspace,
                    'test-package',
                    '1.0.0',
                    mockSBOM
                )
            ).rejects.toThrow(error);
        });

        it('should propagate package repository errors', async () => {
            const mockSBOM = createMockSBOMOutput();
            const error = new Error('Package repository failed');

            packageRepository.getVersionInfo.mockRejectedValue(error);

            await expect(
                service.getDependencyData(
                    mockAnalysisId,
                    mockWorkspace,
                    'test-package',
                    '1.0.0',
                    mockSBOM
                )
            ).rejects.toThrow(error);
        });
    });

    describe('service instantiation', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should have correct dependencies injected', () => {
            expect(service['resultRepository']).toBe(resultRepository);
            expect(service['vulnerabilitiesUtilsService']).toBe(vulnerabilitiesUtilsService);
            expect(service['licensesUtilsService']).toBe(licensesUtilsService);
            expect(service['packageRepository']).toBe(packageRepository);
        });
    });
});