import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from './projects.service';
import { OrganizationLoggerService } from '../organizations/log/organizationLogger.service';
import { ProjectMemberService } from './projectMember.service';
import { GithubRepositoriesService } from '../integrations/github/githubRepos.service';
import { GitlabRepositoriesService } from '../integrations/gitlab/gitlabRepos.service';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { FileRepository } from '../file/file.repository';
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { AnalysisResultsRepository } from '../../codeclarity_modules/results/results.repository';
import { AnalysesRepository } from '../analyses/analyses.repository';
import { ProjectsRepository } from './projects.repository';
import { AuthenticatedUser, ROLE } from '../auth/auth.types';
import { Project } from './project.entity';
import { ProjectImportBody } from './project.types';
import { IntegrationProvider } from '../integrations/integration.types';
import { MemberRole } from '../organizations/memberships/orgMembership.types';
import { EntityNotFound, IntegrationNotSupported, NotAuthorized } from '../../types/error.types';
import { SortDirection } from '../../types/sort.types';
import { AllowedOrderByGetProjects } from './projects.service';

describe('ProjectService', () => {
    let service: ProjectService;
    let projectMemberService: jest.Mocked<ProjectMemberService>;
    let organizationsRepository: jest.Mocked<OrganizationsRepository>;
    let integrationsRepository: jest.Mocked<IntegrationsRepository>;
    let projectsRepository: jest.Mocked<ProjectsRepository>;

    const mockAuthenticatedUser = new AuthenticatedUser('test-user-id', [ROLE.USER], true);
    const mockOrgId = 'test-org-id';
    const mockProjectId = 'test-project-id';
    const mockIntegrationId = 'test-integration-id';

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectService,
                {
                    provide: OrganizationLoggerService,
                    useValue: { addAuditLog: jest.fn().mockResolvedValue(null) }
                },
                {
                    provide: ProjectMemberService,
                    useValue: { doesProjectBelongToOrg: jest.fn().mockResolvedValue(undefined) }
                },
                {
                    provide: GithubRepositoriesService,
                    useValue: {
                        syncGithubRepos: jest.fn().mockResolvedValue(undefined),
                        getGithubRepository: jest.fn()
                    }
                },
                {
                    provide: GitlabRepositoriesService,
                    useValue: {
                        syncGitlabRepos: jest.fn().mockResolvedValue(undefined),
                        getGitlabRepository: jest.fn()
                    }
                },
                {
                    provide: UsersRepository,
                    useValue: { getUserById: jest.fn() }
                },
                {
                    provide: OrganizationsRepository,
                    useValue: {
                        hasRequiredRole: jest.fn().mockResolvedValue(undefined),
                        getOrganizationById: jest.fn(),
                        getMembershipRole: jest.fn(),
                        saveOrganization: jest.fn()
                    }
                },
                {
                    provide: FileRepository,
                    useValue: { remove: jest.fn().mockResolvedValue(undefined) }
                },
                {
                    provide: IntegrationsRepository,
                    useValue: { getIntegrationByIdAndOrganizationAndUser: jest.fn() }
                },
                {
                    provide: AnalysisResultsRepository,
                    useValue: { remove: jest.fn().mockResolvedValue(undefined) }
                },
                {
                    provide: AnalysesRepository,
                    useValue: {
                        getAnalysesByProjectId: jest.fn().mockResolvedValue([]),
                        deleteAnalysis: jest.fn().mockResolvedValue(undefined)
                    }
                },
                {
                    provide: ProjectsRepository,
                    useValue: {
                        saveProject: jest.fn(),
                        getProjectById: jest.fn(),
                        getManyProjects: jest.fn(),
                        deleteProject: jest.fn().mockResolvedValue(undefined),
                        doesProjectBelongToOrg: jest.fn().mockResolvedValue(undefined)
                    }
                }
            ]
        }).compile();

        service = module.get<ProjectService>(ProjectService);
        projectMemberService = module.get(ProjectMemberService);
        organizationsRepository = module.get(OrganizationsRepository);
        integrationsRepository = module.get(IntegrationsRepository);
        projectsRepository = module.get(ProjectsRepository);
    });

    describe('import', () => {
        it('should throw NotAuthorized when user lacks permission', async () => {
            organizationsRepository.hasRequiredRole.mockRejectedValue(new NotAuthorized());
            const projectImportBody: ProjectImportBody = {
                name: 'Test Project',
                description: 'A test project',
                url: 'https://github.com/test/repo',
                integration_id: mockIntegrationId
            };

            await expect(
                service.import(mockOrgId, projectImportBody, mockAuthenticatedUser)
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw EntityNotFound when integration not found', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            integrationsRepository.getIntegrationByIdAndOrganizationAndUser.mockRejectedValue(
                new EntityNotFound()
            );
            const projectImportBody: ProjectImportBody = {
                name: 'Test Project',
                description: 'A test project',
                url: 'https://github.com/test/repo',
                integration_id: mockIntegrationId
            };

            await expect(
                service.import(mockOrgId, projectImportBody, mockAuthenticatedUser)
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw IntegrationNotSupported for unsupported integration', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            integrationsRepository.getIntegrationByIdAndOrganizationAndUser.mockResolvedValue({
                integration_provider: 'UNSUPPORTED' as IntegrationProvider
            } as any);
            const projectImportBody: ProjectImportBody = {
                name: 'Test Project',
                description: 'A test project',
                url: 'https://github.com/test/repo',
                integration_id: mockIntegrationId
            };

            await expect(
                service.import(mockOrgId, projectImportBody, mockAuthenticatedUser)
            ).rejects.toThrow(IntegrationNotSupported);
        });
    });

    describe('get', () => {
        it('should throw NotAuthorized when user lacks permission', async () => {
            organizationsRepository.hasRequiredRole.mockRejectedValue(new NotAuthorized());

            await expect(
                service.get(mockOrgId, mockProjectId, mockAuthenticatedUser)
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw EntityNotFound when project does not belong to organization', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            projectMemberService.doesProjectBelongToOrg.mockRejectedValue(new EntityNotFound());

            await expect(
                service.get(mockOrgId, mockProjectId, mockAuthenticatedUser)
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw EntityNotFound when project does not exist', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            projectMemberService.doesProjectBelongToOrg.mockResolvedValue(undefined);
            projectsRepository.getProjectById.mockRejectedValue(new EntityNotFound());

            await expect(
                service.get(mockOrgId, mockProjectId, mockAuthenticatedUser)
            ).rejects.toThrow(EntityNotFound);
        });

        it('should return project successfully', async () => {
            const mockProject = { id: mockProjectId, name: 'Test Project' } as Project;
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            projectMemberService.doesProjectBelongToOrg.mockResolvedValue(undefined);
            projectsRepository.getProjectById.mockResolvedValue(mockProject);

            const result = await service.get(mockOrgId, mockProjectId, mockAuthenticatedUser);

            expect(result).toBe(mockProject);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                mockOrgId,
                'test-user-id',
                MemberRole.USER
            );
            expect(projectMemberService.doesProjectBelongToOrg).toHaveBeenCalledWith(
                mockProjectId,
                mockOrgId
            );
            expect(projectsRepository.getProjectById).toHaveBeenCalledWith(mockProjectId, {
                files: true,
                added_by: true
            });
        });
    });

    describe('getMany', () => {
        it('should throw NotAuthorized when user lacks permission', async () => {
            organizationsRepository.hasRequiredRole.mockRejectedValue(new NotAuthorized());

            await expect(
                service.getMany(
                    mockOrgId,
                    { entriesPerPage: 10, currentPage: 0 },
                    mockAuthenticatedUser
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should return paginated projects successfully', async () => {
            const mockPaginatedResponse = {
                data: [{ id: mockProjectId, name: 'Test Project' } as Project],
                page: 0,
                entry_count: 1,
                entries_per_page: 10,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            projectsRepository.getManyProjects.mockResolvedValue(mockPaginatedResponse);

            const result = await service.getMany(
                mockOrgId,
                { entriesPerPage: 10, currentPage: 0 },
                mockAuthenticatedUser,
                'search',
                AllowedOrderByGetProjects.NAME,
                SortDirection.ASC
            );

            expect(result).toBe(mockPaginatedResponse);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                mockOrgId,
                'test-user-id',
                MemberRole.USER
            );
            expect(projectsRepository.getManyProjects).toHaveBeenCalledWith(
                mockOrgId,
                0,
                10,
                'search'
            );
        });
    });

    describe('delete', () => {
        it('should throw NotAuthorized when user lacks permission', async () => {
            organizationsRepository.hasRequiredRole.mockRejectedValue(new NotAuthorized());

            await expect(
                service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser)
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw EntityNotFound when project does not belong to organization', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            projectsRepository.doesProjectBelongToOrg.mockRejectedValue(new EntityNotFound());

            await expect(
                service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser)
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw EntityNotFound when membership not found', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            projectsRepository.doesProjectBelongToOrg.mockResolvedValue(undefined);
            organizationsRepository.getMembershipRole.mockResolvedValue(null as any);

            await expect(
                service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser)
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user is not authorized to delete', async () => {
            organizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            projectsRepository.doesProjectBelongToOrg.mockResolvedValue(undefined);
            organizationsRepository.getMembershipRole.mockResolvedValue({
                role: MemberRole.USER
            } as any);
            projectsRepository.getProjectById.mockResolvedValue({
                id: mockProjectId,
                added_by: { id: 'different-user-id' }
            } as any);

            await expect(
                service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser)
            ).rejects.toThrow(NotAuthorized);
        });
    });
});
