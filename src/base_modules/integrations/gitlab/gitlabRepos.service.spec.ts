import { Test, TestingModule } from '@nestjs/testing';
import { GitlabRepositoriesService } from './gitlabRepos.service';
import { GitlabIntegrationService } from './gitlab.service';
import { OrganizationsRepository } from '../../organizations/organizations.repository';
import { IntegrationsRepository } from '../integrations.repository';
import { Repository } from 'typeorm';
import { RepositoryCache, RepositoryType } from '../../projects/repositoryCache.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthenticatedUser, ROLE } from '../../auth/auth.types';
import { EntityNotFound, NotAuthorized } from '../../../types/error.types';
import { MemberRole } from '../../organizations/memberships/organization.memberships.entity';
import { Integration, IntegrationProvider, IntegrationType } from '../integrations.entity';
import { GitlabIntegrationToken } from '../Token';
import { GitlabTokenType } from './gitlabIntegration.types';
import { SortDirection } from '../../../types/sort.types';
import { PaginationUserSuppliedConf } from '../../../types/pagination.types';

// Mock fetch globally
global.fetch = jest.fn();

// Mock ms module
jest.mock('ms', () => ({
    __esModule: true,
    default: (time: string) => {
        if (time === '-90m') return -90 * 60 * 1000;
        if (time === '-7d') return -7 * 24 * 60 * 60 * 1000;
        if (time === '-10m') return -10 * 60 * 1000;
        return 1000;
    }
}));

describe('GitlabRepositoriesService', () => {
    let service: GitlabRepositoriesService;
    let gitlabIntegrationService: jest.Mocked<GitlabIntegrationService>;
    let organizationsRepository: jest.Mocked<OrganizationsRepository>;
    let integrationsRepository: jest.Mocked<IntegrationsRepository>;
    let repositoryCacheRepository: jest.Mocked<Repository<RepositoryCache>>;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    const mockIntegration: Integration = {
        id: 'test-integration-id',
        integration_type: IntegrationType.VCS,
        integration_provider: IntegrationProvider.GITLAB,
        access_token: 'glpat-test-token',
        refresh_token: undefined,
        expiry_date: undefined,
        invalid: false,
        added_on: new Date(),
        service_domain: 'https://gitlab.com',
        token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
        organizations: [],
        owner: {} as any,
        users: [],
        last_repository_sync: new Date(),
        repository_cache: [] as any,
        projects: [],
        analyses: []
    };

    const mockRepositoryCache: RepositoryCache = {
        id: 'test-repo-id',
        fully_qualified_name: 'test-user/test-repo',
        url: 'https://gitlab.com/test-user/test-repo',
        default_branch: 'main',
        visibility: 'public',
        description: 'Test repository',
        created_at: new Date(),
        repository_type: RepositoryType.GITLAB,
        integration: mockIntegration,
        service_domain: 'https://gitlab.com'
    };

    const mockGitlabProjects = [
        {
            id: 1,
            name: 'test-repo',
            name_with_namespace: 'test-user/test-repo',
            http_url_to_repo: 'https://gitlab.com/test-user/test-repo.git',
            default_branch: 'main',
            visibility: 'public',
            description: 'Test repository',
            created_at: '2023-01-01T00:00:00.000Z'
        },
        {
            id: 2,
            name: 'another-repo',
            name_with_namespace: 'test-user/another-repo',
            http_url_to_repo: 'https://gitlab.com/test-user/another-repo.git',
            default_branch: 'master',
            visibility: 'private',
            description: 'Another test repository',
            created_at: '2023-01-02T00:00:00.000Z'
        }
    ];

    const mockGitlabIntegrationToken: GitlabIntegrationToken = {
        getToken: jest.fn().mockReturnValue('glpat-test-token'),
        validate: jest.fn().mockResolvedValue(undefined),
        refresh: jest.fn().mockResolvedValue(undefined)
    } as any;

    beforeEach(async () => {
        const mockGitlabIntegrationService = {
            getToken: jest.fn(),
            getGitlabIntegration: jest.fn(),
            addGitlabIntegration: jest.fn(),
            modifyGitlabIntegration: jest.fn(),
            removeGitlabIntegration: jest.fn()
        };

        const mockOrganizationsRepository = {
            hasRequiredRole: jest.fn(),
            doesIntegrationBelongToOrg: jest.fn(),
            getOrganizationById: jest.fn(),
            saveOrganization: jest.fn()
        };

        const mockIntegrationsRepository = {
            getIntegrationById: jest.fn(),
            saveIntegration: jest.fn()
        };

        const mockRepositoryCacheRepository = {
            existsBy: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GitlabRepositoriesService,
                {
                    provide: GitlabIntegrationService,
                    useValue: mockGitlabIntegrationService
                },
                {
                    provide: OrganizationsRepository,
                    useValue: mockOrganizationsRepository
                },
                {
                    provide: IntegrationsRepository,
                    useValue: mockIntegrationsRepository
                },
                {
                    provide: getRepositoryToken(RepositoryCache, 'codeclarity'),
                    useValue: mockRepositoryCacheRepository
                }
            ]
        }).compile();

        service = module.get<GitlabRepositoriesService>(GitlabRepositoriesService);
        gitlabIntegrationService = module.get(GitlabIntegrationService);
        organizationsRepository = module.get(OrganizationsRepository);
        integrationsRepository = module.get(IntegrationsRepository);
        repositoryCacheRepository = module.get(getRepositoryToken(RepositoryCache, 'codeclarity'));

        // Reset mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('syncGitlabRepos', () => {
        beforeEach(() => {
            (fetch as jest.Mock).mockClear();
        });

        it('should successfully sync GitLab repositories', async () => {
            const tokenMock = {
                getToken: jest.fn().mockReturnValue('glpat-test-token'),
                validate: jest.fn().mockResolvedValue(undefined)
            } as any;

            gitlabIntegrationService.getToken.mockResolvedValue(tokenMock);
            integrationsRepository.getIntegrationById.mockResolvedValue(mockIntegration);
            repositoryCacheRepository.existsBy.mockResolvedValue(false);
            repositoryCacheRepository.save.mockResolvedValue(mockRepositoryCache);
            integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockGitlabProjects)
            });

            await service.syncGitlabRepos('test-integration-id');

            expect(gitlabIntegrationService.getToken).toHaveBeenCalledWith('test-integration-id');
            expect(integrationsRepository.getIntegrationById).toHaveBeenCalledWith(
                'test-integration-id'
            );
            expect(fetch).toHaveBeenCalledWith(
                'https://gitlab.com/api/v4/projects?owned=true&membership=true&per_page=100',
                {
                    headers: {
                        'PRIVATE-TOKEN': 'glpat-test-token'
                    }
                }
            );
            expect(repositoryCacheRepository.existsBy).toHaveBeenCalledTimes(2);
            expect(repositoryCacheRepository.save).toHaveBeenCalledTimes(2);
            expect(integrationsRepository.saveIntegration).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...mockIntegration,
                    last_repository_sync: expect.any(Date)
                })
            );
        });

        it('should skip existing repositories during sync', async () => {
            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            integrationsRepository.getIntegrationById.mockResolvedValue(mockIntegration);
            repositoryCacheRepository.existsBy.mockResolvedValue(true);
            integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockGitlabProjects)
            });

            await service.syncGitlabRepos('test-integration-id');

            expect(repositoryCacheRepository.existsBy).toHaveBeenCalledTimes(2);
            expect(repositoryCacheRepository.save).not.toHaveBeenCalled();
        });

        it('should throw error when GitLab API request fails', async () => {
            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            integrationsRepository.getIntegrationById.mockResolvedValue(mockIntegration);

            (fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 401
            });

            await expect(service.syncGitlabRepos('test-integration-id')).rejects.toThrow(
                'Failed to fetch repositories from GitLab. Status: 401'
            );
        });

        it('should handle network errors', async () => {
            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            integrationsRepository.getIntegrationById.mockResolvedValue(mockIntegration);

            (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(service.syncGitlabRepos('test-integration-id')).rejects.toThrow(
                'Network error'
            );
        });

        it('should handle repositories with missing optional fields', async () => {
            const incompleteProjects = [
                {
                    id: 1,
                    name: 'test-repo',
                    name_with_namespace: 'test-user/test-repo',
                    http_url_to_repo: 'https://gitlab.com/test-user/test-repo.git',
                    default_branch: 'main'
                    // Missing visibility, description, created_at
                }
            ];

            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            integrationsRepository.getIntegrationById.mockResolvedValue(mockIntegration);
            repositoryCacheRepository.existsBy.mockResolvedValue(false);
            repositoryCacheRepository.save.mockResolvedValue(mockRepositoryCache);
            integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(incompleteProjects)
            });

            await service.syncGitlabRepos('test-integration-id');

            expect(repositoryCacheRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    repository_type: RepositoryType.GITLAB,
                    url: 'https://gitlab.com/test-user/test-repo.git',
                    default_branch: 'main',
                    visibility: 'public',
                    fully_qualified_name: 'test-user/test-repo',
                    description: '',
                    created_at: expect.any(Date),
                    integration: mockIntegration
                })
            );
        });
    });

    describe('getGitlabRepositories', () => {
        const createMockQueryBuilder = () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getCount: jest.fn(),
            getMany: jest.fn()
        });

        const mockQueryBuilder = createMockQueryBuilder();

        const paginationConfig: PaginationUserSuppliedConf = {
            currentPage: 0,
            entriesPerPage: 20
        };

        beforeEach(() => {
            const freshMockQueryBuilder = createMockQueryBuilder();
            repositoryCacheRepository.createQueryBuilder.mockReturnValue(
                freshMockQueryBuilder as any
            );

            // Reset mock implementations
            Object.assign(mockQueryBuilder, freshMockQueryBuilder);
        });

        it('should successfully retrieve GitLab repositories with default parameters', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            // Mock areGitlabReposSynced to return true
            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            const result = await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser
            );

            expect(result).toEqual({
                data: [mockRepositoryCache],
                page: 0,
                entry_count: 1,
                entries_per_page: 20,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            });

            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'test-org-id',
                'test-user-id',
                MemberRole.USER
            );
            expect(organizationsRepository.doesIntegrationBelongToOrg).toHaveBeenCalledWith(
                'test-integration-id',
                'test-org-id'
            );
            expect(repositoryCacheRepository.createQueryBuilder).toHaveBeenCalledWith('repo');
            expect(mockQueryBuilder.where).toHaveBeenCalledWith(
                'repo.integration = :integrationId',
                { integrationId: 'test-integration-id' }
            );
        });

        it('should retrieve repositories with custom pagination parameters', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(50);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            const customPaginationConfig: PaginationUserSuppliedConf = {
                currentPage: 2,
                entriesPerPage: 10
            };

            const result = await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                customPaginationConfig,
                mockAuthenticatedUser
            );

            expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
            expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
            expect(result.page).toBe(2);
            expect(result.entries_per_page).toBe(10);
        });

        it('should handle search functionality', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser,
                'test-search'
            );

            expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
                'repo.fully_qualified_name LIKE :searchValue',
                { searchValue: '%test-search%' }
            );
        });

        it('should handle sorting by fully_qualified_name', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser,
                undefined,
                false,
                [],
                'fully_qualified_name',
                SortDirection.DESC
            );

            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('fully_qualified_name', 'DESC');
        });

        it('should handle sorting by description', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser,
                undefined,
                false,
                [],
                'description',
                SortDirection.ASC
            );

            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('description', 'ASC');
        });

        it('should handle sorting by created_at', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser,
                undefined,
                false,
                [],
                'created_at',
                SortDirection.ASC
            );

            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'ASC');
        });

        it('should handle sorting by imported status', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser,
                undefined,
                false,
                [],
                'imported',
                SortDirection.ASC
            );

            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('imported_already', 'ASC');
        });

        it('should force refresh when forceRefresh is true', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            integrationsRepository.getIntegrationById.mockResolvedValue(mockIntegration);
            repositoryCacheRepository.existsBy.mockResolvedValue(true);
            integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue([])
            });

            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser,
                undefined,
                true
            );

            expect(fetch).toHaveBeenCalled();
        });

        it('should sync repositories when not synced', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            // Mock areGitlabReposSynced to return false
            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date(0)
            });

            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            repositoryCacheRepository.existsBy.mockResolvedValue(true);
            integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue([])
            });

            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                paginationConfig,
                mockAuthenticatedUser
            );

            expect(fetch).toHaveBeenCalled();
        });

        it('should throw NotAuthorized when user lacks required role', async () => {
            organizationsRepository.hasRequiredRole.mockRejectedValue(new NotAuthorized());

            await expect(
                service.getGitlabRepositories(
                    'test-org-id',
                    'test-integration-id',
                    paginationConfig,
                    mockAuthenticatedUser
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw NotAuthorized when integration does not belong to org', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(false);

            await expect(
                service.getGitlabRepositories(
                    'test-org-id',
                    'test-integration-id',
                    paginationConfig,
                    mockAuthenticatedUser
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should respect maximum entries per page limit', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue([mockRepositoryCache]);

            const largePaginationConfig: PaginationUserSuppliedConf = {
                currentPage: 0,
                entriesPerPage: 200 // Exceeds maximum of 100
            };

            await service.getGitlabRepositories(
                'test-org-id',
                'test-integration-id',
                largePaginationConfig,
                mockAuthenticatedUser
            );

            expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
        });
    });

    describe('areGitlabReposSynced', () => {
        it('should return false when last_repository_sync is null', async () => {
            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: null as any
            });

            const result = await service.areGitlabReposSynced('test-integration-id');

            expect(result).toBe(false);
        });

        it('should return false when last sync is older than invalidation time', async () => {
            const oldDate = new Date(Date.now() - 700000); // 11+ minutes ago

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: oldDate
            });

            const result = await service.areGitlabReposSynced('test-integration-id');

            expect(result).toBe(false);
        });

        it('should return true when last sync is recent', async () => {
            const recentDate = new Date(Date.now() - 300000); // 5 minutes ago

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: recentDate
            });

            const result = await service.areGitlabReposSynced('test-integration-id');

            expect(result).toBe(true);
        });
    });

    describe('getGitlabRepository', () => {
        it('should successfully retrieve a specific GitLab repository', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            repositoryCacheRepository.findOne.mockResolvedValue(mockRepositoryCache);

            const result = await service.getGitlabRepository(
                'test-org-id',
                'test-integration-id',
                'https://gitlab.com/test-user/test-repo',
                mockAuthenticatedUser
            );

            expect(result).toEqual(mockRepositoryCache);
            expect(repositoryCacheRepository.findOne).toHaveBeenCalledWith({
                relations: ['integration'],
                where: {
                    url: 'https://gitlab.com/test-user/test-repo',
                    integration: {
                        id: 'test-integration-id'
                    }
                }
            });
        });

        it('should sync repositories before retrieving when not synced', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            // Mock areGitlabReposSynced to return false
            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date(0)
            });

            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            repositoryCacheRepository.existsBy.mockResolvedValue(true);
            integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);
            repositoryCacheRepository.findOne.mockResolvedValue(mockRepositoryCache);

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue([])
            });

            const result = await service.getGitlabRepository(
                'test-org-id',
                'test-integration-id',
                'https://gitlab.com/test-user/test-repo',
                mockAuthenticatedUser
            );

            expect(fetch).toHaveBeenCalled();
            expect(result).toEqual(mockRepositoryCache);
        });

        it('should force refresh when forceRefresh is true', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            gitlabIntegrationService.getToken.mockResolvedValue(mockGitlabIntegrationToken);
            integrationsRepository.getIntegrationById.mockResolvedValue(mockIntegration);
            repositoryCacheRepository.existsBy.mockResolvedValue(true);
            integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);
            repositoryCacheRepository.findOne.mockResolvedValue(mockRepositoryCache);

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue([])
            });

            const result = await service.getGitlabRepository(
                'test-org-id',
                'test-integration-id',
                'https://gitlab.com/test-user/test-repo',
                mockAuthenticatedUser,
                true
            );

            expect(fetch).toHaveBeenCalled();
            expect(result).toEqual(mockRepositoryCache);
        });

        it('should throw NotAuthorized when user lacks required role', async () => {
            organizationsRepository.hasRequiredRole.mockRejectedValue(new NotAuthorized());

            await expect(
                service.getGitlabRepository(
                    'test-org-id',
                    'test-integration-id',
                    'https://gitlab.com/test-user/test-repo',
                    mockAuthenticatedUser
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw NotAuthorized when integration does not belong to org', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(false);

            await expect(
                service.getGitlabRepository(
                    'test-org-id',
                    'test-integration-id',
                    'https://gitlab.com/test-user/test-repo',
                    mockAuthenticatedUser
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw EntityNotFound when repository is not found', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(true);

            integrationsRepository.getIntegrationById.mockResolvedValue({
                ...mockIntegration,
                last_repository_sync: new Date()
            });

            repositoryCacheRepository.findOne.mockResolvedValue(null);

            await expect(
                service.getGitlabRepository(
                    'test-org-id',
                    'test-integration-id',
                    'https://gitlab.com/test-user/nonexistent-repo',
                    mockAuthenticatedUser
                )
            ).rejects.toThrow(EntityNotFound);
        });
    });
});
