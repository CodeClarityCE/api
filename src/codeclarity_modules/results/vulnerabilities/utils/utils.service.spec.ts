import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
    PluginResultNotAvailable,
    PluginFailed,
    UnknownWorkspace
} from '../../../../types/error.types';
import { Result } from '../../result.entity';
import type { Dependency } from '../../sbom/sbom.types';
import { Status } from '../vulnerabilities.types';

import { VulnerabilitiesUtilsService } from './utils.service';

describe('VulnerabilitiesUtilsService', () => {
    let service: VulnerabilitiesUtilsService;
    let mockRepository: jest.Mocked<Repository<Result>>;

    beforeEach(async () => {
        const mockRepo = {
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VulnerabilitiesUtilsService,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockRepo
                }
            ]
        }).compile();

        service = module.get<VulnerabilitiesUtilsService>(VulnerabilitiesUtilsService);
        mockRepository = module.get(getRepositoryToken(Result, 'codeclarity'));
    });

    describe('getVulnsResult', () => {
        it('should return vulnerability result when found', async () => {
            const mockResult = {
                id: 'result-id',
                plugin: 'js-vuln-finder',
                result: {
                    analysis_info: {
                        status: Status.Success,
                        private_errors: [],
                        public_errors: [],
                        analysis_start_time: '2023-01-01T00:00:00Z',
                        analysis_end_time: '2023-01-01T00:01:00Z',
                        analysis_delta_time: 60000,
                        version_seperator: '.',
                        import_path_seperator: '/',
                        default_workspace_name: 'default',
                        self_managed_workspace_name: 'self-managed'
                    },
                    workspaces: {
                        default: {
                            Vulnerabilities: []
                        }
                    }
                }
            };

            mockRepository.findOne.mockResolvedValue({ ...mockResult, analysis: {} } as any);

            const result = await service.getVulnsResult('analysis-id');

            expect(result).toEqual(mockResult.result);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: 'analysis-id'
                    },
                    plugin: 'vuln-finder'
                },
                order: {
                    analysis: {
                        created_on: 'DESC'
                    }
                },
                cache: true
            });
        });

        it('should throw PluginResultNotAvailable when result is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(service.getVulnsResult('analysis-id')).rejects.toThrow(
                PluginResultNotAvailable
            );
        });

        it('should throw PluginFailed when analysis status is failure', async () => {
            const mockResult = {
                id: 'result-id',
                plugin: 'js-vuln-finder',
                result: {
                    analysis_info: {
                        status: Status.Failure,
                        private_errors: ['Error occurred'],
                        public_errors: [],
                        analysis_start_time: '2023-01-01T00:00:00Z',
                        analysis_end_time: '2023-01-01T00:01:00Z',
                        analysis_delta_time: 60000,
                        version_seperator: '.',
                        import_path_seperator: '/',
                        default_workspace_name: 'default',
                        self_managed_workspace_name: 'self-managed'
                    },
                    workspaces: {}
                }
            };

            mockRepository.findOne.mockResolvedValue({ ...mockResult, analysis: {} } as any);

            await expect(service.getVulnsResult('analysis-id')).rejects.toThrow(PluginFailed);
        });
    });

    describe('getFindingsData', () => {
        it('should return vulnerabilities for valid workspace', async () => {
            const mockVulnerabilities = [
                {
                    Id: 'vuln-1',
                    Sources: [],
                    AffectedDependency: 'test-dep',
                    AffectedVersion: '1.0.0',
                    VulnerabilityId: 'CVE-2023-1234',
                    Severity: {
                        Severity: 7.5,
                        SeverityClass: 'HIGH',
                        SeverityType: 'CVSS_V3',
                        Vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                        Impact: 5.9,
                        Exploitability: 3.9,
                        ConfidentialityImpact: 'HIGH',
                        IntegrityImpact: 'HIGH',
                        AvailabilityImpact: 'HIGH',
                        ConfidentialityImpactNumerical: 0.56,
                        IntegrityImpactNumerical: 0.56,
                        AvailabilityImpactNumerical: 0.56
                    },
                    Weaknesses: [],
                    OSVMatch: {},
                    NVDMatch: {},
                    Conflict: {
                        ConflictWinner: 'NVD',
                        ConflictFlag: 'NO_CONFLICT'
                    }
                }
            ];

            const mockResult = {
                analysis_info: {
                    status: Status.Success,
                    private_errors: [],
                    public_errors: [],
                    analysis_start_time: '2023-01-01T00:00:00Z',
                    analysis_end_time: '2023-01-01T00:01:00Z',
                    analysis_delta_time: 60000,
                    version_seperator: '.',
                    import_path_seperator: '/',
                    default_workspace_name: 'default',
                    self_managed_workspace_name: 'self-managed'
                },
                workspaces: {
                    'test-workspace': {
                        Vulnerabilities: mockVulnerabilities
                    }
                }
            };

            mockRepository.findOne.mockResolvedValue({
                id: 'result-id',
                plugin: 'js-vuln-finder',
                result: mockResult,
                analysis: {} as any
            } as any);

            const result = await service.getFindingsData('analysis-id', 'test-workspace');

            expect(result).toEqual(mockVulnerabilities);
        });

        it('should throw UnknownWorkspace when workspace does not exist', async () => {
            const mockResult = {
                analysis_info: {
                    status: Status.Success,
                    private_errors: [],
                    public_errors: [],
                    analysis_start_time: '2023-01-01T00:00:00Z',
                    analysis_end_time: '2023-01-01T00:01:00Z',
                    analysis_delta_time: 60000,
                    version_seperator: '.',
                    import_path_seperator: '/',
                    default_workspace_name: 'default',
                    self_managed_workspace_name: 'self-managed'
                },
                workspaces: {
                    'existing-workspace': {
                        Vulnerabilities: []
                    }
                }
            };

            mockRepository.findOne.mockResolvedValue({
                id: 'result-id',
                plugin: 'js-vuln-finder',
                result: mockResult,
                analysis: {} as any
            } as any);

            await expect(
                service.getFindingsData('analysis-id', 'non-existent-workspace')
            ).rejects.toThrow(UnknownWorkspace);
        });

        it('should return empty array when no vulnerabilities exist', async () => {
            const mockResult = {
                analysis_info: {
                    status: Status.Success,
                    private_errors: [],
                    public_errors: [],
                    analysis_start_time: '2023-01-01T00:00:00Z',
                    analysis_end_time: '2023-01-01T00:01:00Z',
                    analysis_delta_time: 60000,
                    version_seperator: '.',
                    import_path_seperator: '/',
                    default_workspace_name: 'default',
                    self_managed_workspace_name: 'self-managed'
                },
                workspaces: {
                    'test-workspace': {
                        Vulnerabilities: null
                    }
                }
            };

            mockRepository.findOne.mockResolvedValue({
                id: 'result-id',
                plugin: 'js-vuln-finder',
                result: mockResult,
                analysis: {} as any
            } as any);

            const result = await service.getFindingsData('analysis-id', 'test-workspace');

            expect(result).toEqual([]);
        });
    });

    describe('getImportPaths', () => {
        it('should return empty array when dependency is already in parents set', async () => {
            const dependenciesMap = {
                'test-dep': {
                    key: 'test-dep',
                    parents: ['parent-dep']
                } as Partial<Dependency>
            };

            const parentsSet = new Set(['test-dep']);

            const result = await service.getImportPaths(
                dependenciesMap as Record<string, Dependency>,
                'test-dep',
                'current-path',
                [],
                parentsSet
            );

            expect(result).toEqual([]);
        });

        it('should return empty array when dependency is already in current path', async () => {
            const dependenciesMap = {
                'test-dep': {
                    key: 'test-dep',
                    parents: ['parent-dep']
                } as Partial<Dependency>
            };

            const result = await service.getImportPaths(
                dependenciesMap as Record<string, Dependency>,
                'test-dep',
                'current-path test-dep',
                []
            );

            expect(result).toEqual([]);
        });

        it('should handle missing dependency in map', async () => {
            const dependenciesMap = {};

            const result = await service.getImportPaths(
                dependenciesMap,
                'non-existent-dep',
                'current-path',
                []
            );

            expect(result).toEqual([]);
        });

        it('should handle empty dependencies map', async () => {
            const result = await service.getImportPaths({}, 'test-dep', 'current-path', []);

            expect(result).toEqual([]);
        });

        it('should handle circular dependencies', async () => {
            const dependenciesMap = {
                'dep-a': {
                    key: 'dep-a',
                    parents: ['dep-b']
                } as Partial<Dependency>,
                'dep-b': {
                    key: 'dep-b',
                    parents: ['dep-a']
                } as Partial<Dependency>
            };

            const result = await service.getImportPaths(
                dependenciesMap as Record<string, Dependency>,
                'dep-a',
                'current-path dep-a',
                []
            );

            expect(result).toEqual([]);
        });
    });

    describe('service initialization', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should inject repository correctly', () => {
            expect(mockRepository).toBeDefined();
        });
    });
});
