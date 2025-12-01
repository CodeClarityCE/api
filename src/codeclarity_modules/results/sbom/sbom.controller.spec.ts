import { Test, type TestingModule } from '@nestjs/testing';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import type { PaginatedResponse } from 'src/types/apiResponses.types';
import { SBOMController } from './sbom.controller';
import { SBOMService } from './sbom.service';

describe('SBOMController', () => {
    let controller: SBOMController;
    let service: SBOMService;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockSbomService = {
        getSbom: jest.fn(),
        getStats: jest.fn(),
        getWorkspaces: jest.fn(),
        getDependency: jest.fn(),
        getDependencyGraph: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SBOMController],
            providers: [
                {
                    provide: SBOMService,
                    useValue: mockSbomService
                }
            ]
        }).compile();

        controller = module.get<SBOMController>(SBOMController);
        service = module.get<SBOMService>(SBOMService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('getSbom', () => {
        it('should return paginated SBOM data', async () => {
            const mockResponse: PaginatedResponse = {
                data: [],
                page: 0,
                entry_count: 0,
                entries_per_page: 20,
                total_entries: 0,
                total_pages: 0,
                matching_count: 0,
                filter_count: {}
            };

            mockSbomService.getSbom.mockResolvedValue(mockResponse);

            const result = await controller.getSbom(
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

            expect(result).toBe(mockResponse);
            expect(service.getSbom).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                {
                    workspace: 'default',
                    page: -1,
                    entriesPerPage: 20,
                    sortBy: 'name',
                    sortDirection: 'asc',
                    activeFilters: undefined,
                    searchKey: undefined,
                    ecosystemFilter: undefined
                }
            );
        });

        it('should handle query parameters correctly', async () => {
            const mockResponse: PaginatedResponse = {
                data: [],
                page: 1,
                entry_count: 10,
                entries_per_page: 10,
                total_entries: 100,
                total_pages: 10,
                matching_count: 100,
                filter_count: {}
            };

            mockSbomService.getSbom.mockResolvedValue(mockResponse);

            const result = await controller.getSbom(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                1,
                10,
                'version',
                'desc',
                '[direct,transitive]',
                'package'
            );

            expect(result).toBe(mockResponse);
            expect(service.getSbom).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                {
                    workspace: 'default',
                    page: 1,
                    entriesPerPage: 10,
                    sortBy: 'version',
                    sortDirection: 'desc',
                    activeFilters: '[direct,transitive]',
                    searchKey: 'package',
                    ecosystemFilter: undefined
                }
            );
        });

        it('should handle undefined query parameters', async () => {
            const mockResponse: PaginatedResponse = {
                data: [],
                page: 0,
                entry_count: 0,
                entries_per_page: 20,
                total_entries: 0,
                total_pages: 0,
                matching_count: 0,
                filter_count: {}
            };

            mockSbomService.getSbom.mockResolvedValue(mockResponse);

            const result = await controller.getSbom(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result).toBe(mockResponse);
            expect(service.getSbom).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                {
                    workspace: 'default',
                    page: -1,
                    entriesPerPage: -1,
                    sortBy: undefined,
                    sortDirection: undefined,
                    activeFilters: undefined,
                    searchKey: undefined,
                    ecosystemFilter: undefined
                }
            );
        });
    });

    describe('getStats', () => {
        it('should return SBOM statistics', async () => {
            const mockStats = {
                number_of_dependencies: 10,
                number_of_direct_dependencies: 5,
                number_of_transitive_dependencies: 5
            };

            mockSbomService.getStats.mockResolvedValue(mockStats);

            const result = await controller.getStats(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default'
            );

            expect(result).toEqual({ data: mockStats });
            expect(service.getStats).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                'default',
                mockUser,
                undefined
            );
        });
    });

    describe('getWorkspaces', () => {
        it('should return available workspaces', async () => {
            const mockWorkspaces = {
                workspaces: ['default', 'workspace1'],
                package_manager: 'npm'
            };

            mockSbomService.getWorkspaces.mockResolvedValue(mockWorkspaces);

            const result = await controller.getWorkspaces(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );

            expect(result).toEqual({ data: mockWorkspaces });
            expect(service.getWorkspaces).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );
        });
    });

    describe('getDependency', () => {
        it('should return dependency details', async () => {
            const mockDependency = {
                name: 'package1',
                version: '1.0.0',
                latest_version: '1.2.0',
                dependencies: {},
                dev_dependencies: {},
                transitive: false
            };

            mockSbomService.getDependency.mockResolvedValue(mockDependency);

            const result = await controller.getDependency(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'default',
                'package1@1.0.0'
            );

            expect(result).toEqual({ data: mockDependency });
            expect(service.getDependency).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                'default',
                'package1@1.0.0',
                mockUser
            );
        });
    });

    describe('getDependencyGraph', () => {
        it('should return dependency graph', async () => {
            const mockGraph = [
                {
                    id: 'package1@1.0.0',
                    parentIds: [],
                    childrenIds: ['package2@2.0.0'],
                    prod: true,
                    dev: false
                },
                {
                    id: 'package2@2.0.0',
                    parentIds: ['package1@1.0.0'],
                    childrenIds: [],
                    prod: true,
                    dev: false
                }
            ];

            mockSbomService.getDependencyGraph.mockResolvedValue(mockGraph);

            const result = await controller.getDependencyGraph(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser,
                'package1@1.0.0',
                'default'
            );

            expect(result).toEqual({ data: mockGraph });
            expect(service.getDependencyGraph).toHaveBeenCalledWith(
                'org-123',
                'project-123',
                'analysis-123',
                'default',
                'package1@1.0.0',
                mockUser
            );
        });
    });

    describe('error handling', () => {
        it('should propagate service errors', async () => {
            const error = new Error('Service error');
            mockSbomService.getSbom.mockRejectedValue(error);

            await expect(
                controller.getSbom('org-123', 'project-123', 'analysis-123', mockUser, 'default')
            ).rejects.toThrow('Service error');
        });

        it('should handle service errors in getStats', async () => {
            const error = new Error('Stats error');
            mockSbomService.getStats.mockRejectedValue(error);

            await expect(
                controller.getStats('org-123', 'project-123', 'analysis-123', mockUser, 'default')
            ).rejects.toThrow('Stats error');
        });
    });
});
