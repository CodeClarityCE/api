import { Test, type TestingModule } from '@nestjs/testing';

import {
    EntityNotFound,
    NotAuthorized,
    DuplicateIntegration,
    IntegrationInvalidToken,
    IntegrationTokenExpired,
    IntegrationTokenMissingPermissions,
    IntegrationTokenRetrievalFailed,
    IntegrationWrongTokenType,
    FailedToRetrieveReposFromProvider,
    InternalError,
    NotAuthenticated
} from '../../../types/error.types';
import { SortDirection } from '../../../types/sort.types';
import { AuthenticatedUser, ROLE } from '../../auth/auth.types';
import type { RepositoryCache } from '../../projects/repositoryCache.entity';

import { GitlabIntegrationController } from './gitlab.controller';
import { GitlabIntegrationService } from './gitlab.service';
import {
    type GitlabIntegration,
    type LinkGitlabCreateBody,
    type LinkGitlabPatchBody,
    GitlabTokenType
} from './gitlabIntegration.types';
import { GitlabRepositoriesService } from './gitlabRepos.service';


describe('GitlabIntegrationController', () => {
    let controller: GitlabIntegrationController;
    let gitlabService: jest.Mocked<GitlabIntegrationService>;
    let gitlabReposService: jest.Mocked<GitlabRepositoriesService>;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    const mockGitlabIntegration: GitlabIntegration = {
        id: 'test-integration-id',
        service_base_url: 'https://gitlab.com',
        token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
        organization_id: 'test-org-id',
        access_token: 'test-token',
        integration_type: 'VCS' as any,
        integration_provider: 'GITLAB' as any,
        added_on: new Date(),
        added_by: 'test-user-id',
        service_domain: 'https://gitlab.com',
        invalid: false,
        meta_data: {} as any
    };

    const mockRepositoryCache: RepositoryCache = {
        id: 'test-repo-id',
        fully_qualified_name: 'test-user/test-repo',
        url: 'https://gitlab.com/test-user/test-repo',
        default_branch: 'main',
        visibility: 'public',
        description: 'Test repository',
        created_at: new Date(),
        repository_type: 'GITLAB' as any,
        integration: {} as any,
        service_domain: 'https://gitlab.com'
    };

    beforeEach(async () => {
        const mockGitlabIntegrationService = {
            addGitlabIntegration: jest.fn(),
            getGitlabIntegration: jest.fn(),
            modifyGitlabIntegration: jest.fn(),
            removeGitlabIntegration: jest.fn(),
            getToken: jest.fn()
        };

        const mockGitlabRepositoriesService = {
            getGitlabRepositories: jest.fn(),
            syncGitlabRepos: jest.fn(),
            areGitlabReposSynced: jest.fn(),
            getGitlabRepository: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [GitlabIntegrationController],
            providers: [
                {
                    provide: GitlabIntegrationService,
                    useValue: mockGitlabIntegrationService
                },
                {
                    provide: GitlabRepositoriesService,
                    useValue: mockGitlabRepositoriesService
                }
            ]
        }).compile();

        controller = module.get<GitlabIntegrationController>(GitlabIntegrationController);
        gitlabService = module.get(GitlabIntegrationService);
        gitlabReposService = module.get(GitlabRepositoriesService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('linkGitlab', () => {
        const linkGitlabCreateBody: LinkGitlabCreateBody = {
            token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
            token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
            gitlab_instance_url: 'https://gitlab.com'
        };

        it('should successfully create a GitLab integration', async () => {
            const integrationId = 'test-integration-id';
            gitlabService.addGitlabIntegration.mockResolvedValue(integrationId);

            const result = await controller.linkGitlab(
                linkGitlabCreateBody,
                mockAuthenticatedUser,
                'test-org-id'
            );

            expect(result).toEqual({ id: integrationId });
            expect(gitlabService.addGitlabIntegration).toHaveBeenCalledWith(
                'test-org-id',
                expect.objectContaining({
                    ...linkGitlabCreateBody,
                    token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN
                }),
                mockAuthenticatedUser
            );
        });

        it('should throw NotAuthorized when user is not authorized', async () => {
            gitlabService.addGitlabIntegration.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.linkGitlab(linkGitlabCreateBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw IntegrationWrongTokenType when token type is wrong', async () => {
            gitlabService.addGitlabIntegration.mockRejectedValue(new IntegrationWrongTokenType());

            await expect(
                controller.linkGitlab(linkGitlabCreateBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(IntegrationWrongTokenType);
        });

        it('should throw IntegrationTokenMissingPermissions when token lacks permissions', async () => {
            gitlabService.addGitlabIntegration.mockRejectedValue(
                new IntegrationTokenMissingPermissions()
            );

            await expect(
                controller.linkGitlab(linkGitlabCreateBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(IntegrationTokenMissingPermissions);
        });

        it('should throw IntegrationTokenExpired when token is expired', async () => {
            gitlabService.addGitlabIntegration.mockRejectedValue(new IntegrationTokenExpired());

            await expect(
                controller.linkGitlab(linkGitlabCreateBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(IntegrationTokenExpired);
        });

        it('should throw IntegrationInvalidToken when token is invalid', async () => {
            gitlabService.addGitlabIntegration.mockRejectedValue(new IntegrationInvalidToken());

            await expect(
                controller.linkGitlab(linkGitlabCreateBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(IntegrationInvalidToken);
        });

        it('should throw DuplicateIntegration when integration already exists', async () => {
            gitlabService.addGitlabIntegration.mockRejectedValue(new DuplicateIntegration());

            await expect(
                controller.linkGitlab(linkGitlabCreateBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(DuplicateIntegration);
        });

        it('should throw IntegrationTokenRetrievalFailed when token retrieval fails', async () => {
            gitlabService.addGitlabIntegration.mockRejectedValue(
                new IntegrationTokenRetrievalFailed()
            );

            await expect(
                controller.linkGitlab(linkGitlabCreateBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(IntegrationTokenRetrievalFailed);
        });
    });

    describe('getIntegration', () => {
        it('should successfully retrieve a GitLab integration', async () => {
            gitlabService.getGitlabIntegration.mockResolvedValue(mockGitlabIntegration);

            const result = await controller.getIntegration(
                mockAuthenticatedUser,
                'test-org-id',
                'test-integration-id'
            );

            expect(result).toEqual({ data: mockGitlabIntegration });
            expect(gitlabService.getGitlabIntegration).toHaveBeenCalledWith(
                'test-org-id',
                'test-integration-id',
                mockAuthenticatedUser
            );
        });

        it('should throw NotAuthorized when user is not authorized', async () => {
            gitlabService.getGitlabIntegration.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.getIntegration(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw EntityNotFound when integration is not found', async () => {
            gitlabService.getGitlabIntegration.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.getIntegration(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthenticated when user is not authenticated', async () => {
            gitlabService.getGitlabIntegration.mockRejectedValue(new NotAuthenticated());

            await expect(
                controller.getIntegration(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(NotAuthenticated);
        });

        it('should throw InternalError when internal error occurs', async () => {
            gitlabService.getGitlabIntegration.mockRejectedValue(
                new InternalError('Internal error', 'INTERNAL_ERROR')
            );

            await expect(
                controller.getIntegration(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(InternalError);
        });
    });

    describe('modifyGitlabLink', () => {
        const linkGitlabPatchBody: LinkGitlabPatchBody = {
            token: 'glpat-new-token',
            token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
            gitlab_instance_url: 'https://gitlab.com'
        };

        it('should successfully modify a GitLab integration', async () => {
            gitlabService.modifyGitlabIntegration.mockResolvedValue(undefined);

            const result = await controller.modifyGitlabLink(
                linkGitlabPatchBody,
                mockAuthenticatedUser,
                'test-org-id',
                'test-integration-id'
            );

            expect(result).toEqual({});
            expect(gitlabService.modifyGitlabIntegration).toHaveBeenCalledWith(
                'test-org-id',
                'test-integration-id',
                linkGitlabPatchBody,
                mockAuthenticatedUser
            );
        });

        it('should throw NotAuthorized when user is not authorized', async () => {
            gitlabService.modifyGitlabIntegration.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.modifyGitlabLink(
                    linkGitlabPatchBody,
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('getRepositories', () => {
        const mockPaginatedResponse = {
            data: [mockRepositoryCache],
            page: 0,
            entry_count: 1,
            entries_per_page: 20,
            total_entries: 1,
            total_pages: 1,
            matching_count: 1,
            filter_count: {}
        };

        it('should successfully retrieve repositories with default parameters', async () => {
            gitlabReposService.getGitlabRepositories.mockResolvedValue(mockPaginatedResponse);

            const result = await controller.getRepositories(
                mockAuthenticatedUser,
                'test-org-id',
                'test-integration-id',
                0,
                0
            );

            expect(result).toEqual(mockPaginatedResponse);
            expect(gitlabReposService.getGitlabRepositories).toHaveBeenCalledWith(
                'test-org-id',
                'test-integration-id',
                { currentPage: 0, entriesPerPage: 0 },
                mockAuthenticatedUser,
                undefined,
                undefined,
                [],
                undefined,
                undefined
            );
        });

        it('should successfully retrieve repositories with custom parameters', async () => {
            gitlabReposService.getGitlabRepositories.mockResolvedValue(mockPaginatedResponse);

            const result = await controller.getRepositories(
                mockAuthenticatedUser,
                'test-org-id',
                'test-integration-id',
                1,
                50,
                'test-search',
                true,
                '[filter1,filter2]',
                'name',
                SortDirection.DESC
            );

            expect(result).toEqual(mockPaginatedResponse);
            expect(gitlabReposService.getGitlabRepositories).toHaveBeenCalledWith(
                'test-org-id',
                'test-integration-id',
                { currentPage: 1, entriesPerPage: 50 },
                mockAuthenticatedUser,
                'test-search',
                true,
                ['filter1', 'filter2'],
                'name',
                SortDirection.DESC
            );
        });

        it('should throw NotAuthorized when user is not authorized', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw EntityNotFound when integration is not found', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw IntegrationInvalidToken when token is invalid', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(
                new IntegrationInvalidToken()
            );

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(IntegrationInvalidToken);
        });

        it('should throw FailedToRetrieveReposFromProvider when repo retrieval fails', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(
                new FailedToRetrieveReposFromProvider()
            );

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(FailedToRetrieveReposFromProvider);
        });

        it('should throw IntegrationTokenMissingPermissions when token lacks permissions', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(
                new IntegrationTokenMissingPermissions()
            );

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(IntegrationTokenMissingPermissions);
        });

        it('should throw IntegrationTokenExpired when token is expired', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(
                new IntegrationTokenExpired()
            );

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(IntegrationTokenExpired);
        });

        it('should throw IntegrationTokenRetrievalFailed when token retrieval fails', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(
                new IntegrationTokenRetrievalFailed()
            );

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(IntegrationTokenRetrievalFailed);
        });

        it('should throw InternalError when internal error occurs', async () => {
            gitlabReposService.getGitlabRepositories.mockRejectedValue(
                new InternalError('Internal error', 'INTERNAL_ERROR')
            );

            await expect(
                controller.getRepositories(
                    mockAuthenticatedUser,
                    'test-org-id',
                    'test-integration-id'
                )
            ).rejects.toThrow(InternalError);
        });

        it('should handle empty active_filters parameter', async () => {
            gitlabReposService.getGitlabRepositories.mockResolvedValue(mockPaginatedResponse);

            await controller.getRepositories(
                mockAuthenticatedUser,
                'test-org-id',
                'test-integration-id',
                0,
                20,
                undefined,
                false,
                ''
            );

            expect(gitlabReposService.getGitlabRepositories).toHaveBeenCalledWith(
                'test-org-id',
                'test-integration-id',
                { currentPage: 0, entriesPerPage: 20 },
                mockAuthenticatedUser,
                undefined,
                false,
                [],
                undefined,
                undefined
            );
        });
    });
});
