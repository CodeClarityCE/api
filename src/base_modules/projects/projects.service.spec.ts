import { Test, type TestingModule } from "@nestjs/testing";

import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";

import { AnalysisResultsRepository } from "../../codeclarity_modules/results/results.repository";
import {
  EntityNotFound,
  IntegrationNotSupported,
  NotAuthorized,
} from "../../types/error.types";
import { SortDirection } from "../../types/sort.types";
import { AnalysesRepository } from "../analyses/analyses.repository";
import { AuthenticatedUser, ROLE } from "../auth/auth.types";
import { FileRepository } from "../file/file.repository";
import { GithubRepositoriesService } from "../integrations/github/githubRepos.service";
import { GitlabRepositoriesService } from "../integrations/gitlab/gitlabRepos.service";
import type { IntegrationProvider } from "../integrations/integration.types";
import { IntegrationsRepository } from "../integrations/integrations.repository";
import { OrganizationLoggerService } from "../organizations/log/organizationLogger.service";
import { MemberRole } from "../organizations/memberships/orgMembership.types";

import type { Project } from "./project.entity";
import type { ProjectImportBody } from "./project.types";
import { ProjectMemberService } from "./projectMember.service";
import { AllowedOrderByGetProjects, ProjectService } from "./projects.service";

describe("ProjectService", () => {
  let service: ProjectService;
  let membershipsRepository: MembershipsRepository;
  let integrationsRepository: jest.Mocked<IntegrationsRepository>;
  let projectsRepository: jest.Mocked<ProjectsRepository>;

  const mockAuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );
  const mockOrgId = "test-org-id";
  const mockProjectId = "test-project-id";
  const mockIntegrationId = "test-integration-id";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: OrganizationLoggerService,
          useValue: { addAuditLog: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: ProjectMemberService,
          useValue: {
            doesProjectBelongToOrg: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: GithubRepositoriesService,
          useValue: {
            syncGithubRepos: jest.fn().mockResolvedValue(undefined),
            getGithubRepository: jest.fn(),
          },
        },
        {
          provide: GitlabRepositoriesService,
          useValue: {
            syncGitlabRepos: jest.fn().mockResolvedValue(undefined),
            getGitlabRepository: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: { getUserById: jest.fn() },
        },
        {
          provide: OrganizationsRepository,
          useValue: {
            getOrganizationById: jest.fn(),
            getMembershipRole: jest.fn(),
            saveOrganization: jest.fn(),
          },
        },
        {
          provide: MembershipsRepository,
          useValue: {
            hasRequiredRole: jest.fn().mockResolvedValue(undefined),
            getMembershipRole: jest.fn(),
          },
        },
        {
          provide: FileRepository,
          useValue: { remove: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: IntegrationsRepository,
          useValue: { getIntegrationByIdAndOrganizationAndUser: jest.fn() },
        },
        {
          provide: AnalysisResultsRepository,
          useValue: { remove: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AnalysesRepository,
          useValue: {
            getAnalysesByProjectId: jest.fn().mockResolvedValue([]),
            deleteAnalysis: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ProjectsRepository,
          useValue: {
            saveProject: jest.fn(),
            getProjectById: jest.fn(),
            getManyProjects: jest.fn(),
            deleteProject: jest.fn().mockResolvedValue(undefined),
            doesProjectBelongToOrg: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    membershipsRepository = module.get<MembershipsRepository>(
      MembershipsRepository,
    );
    integrationsRepository = module.get(IntegrationsRepository);
    projectsRepository = module.get(ProjectsRepository);
  });

  describe("import", () => {
    it("should throw NotAuthorized when user lacks permission", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());
      const projectImportBody: ProjectImportBody = {
        name: "Test Project",
        description: "A test project",
        url: "https://github.com/test/repo",
        integration_id: mockIntegrationId,
      };

      await expect(
        service.import(mockOrgId, projectImportBody, mockAuthenticatedUser),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw EntityNotFound when integration not found", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      integrationsRepository.getIntegrationByIdAndOrganizationAndUser.mockRejectedValue(
        new EntityNotFound(),
      );
      const projectImportBody: ProjectImportBody = {
        name: "Test Project",
        description: "A test project",
        url: "https://github.com/test/repo",
        integration_id: mockIntegrationId,
      };

      await expect(
        service.import(mockOrgId, projectImportBody, mockAuthenticatedUser),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw IntegrationNotSupported for unsupported integration", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      integrationsRepository.getIntegrationByIdAndOrganizationAndUser.mockResolvedValue(
        {
          integration_provider: "UNSUPPORTED" as IntegrationProvider,
        } as any,
      );
      const projectImportBody: ProjectImportBody = {
        name: "Test Project",
        description: "A test project",
        url: "https://github.com/test/repo",
        integration_id: mockIntegrationId,
      };

      await expect(
        service.import(mockOrgId, projectImportBody, mockAuthenticatedUser),
      ).rejects.toThrow(IntegrationNotSupported);
    });
  });

  describe("get", () => {
    it("should throw NotAuthorized when user lacks permission", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.get(mockOrgId, mockProjectId, mockAuthenticatedUser),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw EntityNotFound when project does not belong to organization", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.doesProjectBelongToOrg.mockRejectedValue(
        new EntityNotFound(),
      );

      await expect(
        service.get(mockOrgId, mockProjectId, mockAuthenticatedUser),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw EntityNotFound when project does not exist", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.doesProjectBelongToOrg.mockResolvedValue(undefined);
      projectsRepository.getProjectById.mockRejectedValue(new EntityNotFound());

      await expect(
        service.get(mockOrgId, mockProjectId, mockAuthenticatedUser),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should return project successfully", async () => {
      const mockProject = {
        id: mockProjectId,
        name: "Test Project",
      } as Project;
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.doesProjectBelongToOrg.mockResolvedValue(undefined);
      projectsRepository.getProjectById.mockResolvedValue(mockProject);

      const result = await service.get(
        mockOrgId,
        mockProjectId,
        mockAuthenticatedUser,
      );

      expect(result).toBe(mockProject);
      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        mockOrgId,
        "test-user-id",
        MemberRole.USER,
      );
      expect(projectsRepository.doesProjectBelongToOrg).toHaveBeenCalledWith(
        mockProjectId,
        mockOrgId,
      );
      expect(projectsRepository.getProjectById).toHaveBeenCalledWith(
        mockProjectId,
        {
          files: true,
          added_by: true,
        },
      );
    });
  });

  describe("getMany", () => {
    it("should throw NotAuthorized when user lacks permission", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.getMany(
          mockOrgId,
          { entriesPerPage: 10, currentPage: 0 },
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should return paginated projects successfully", async () => {
      const mockPaginatedResponse = {
        data: [{ id: mockProjectId, name: "Test Project" } as Project],
        page: 0,
        entry_count: 1,
        entries_per_page: 10,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      };

      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.getManyProjects.mockResolvedValue(
        mockPaginatedResponse,
      );

      const result = await service.getMany(
        mockOrgId,
        { entriesPerPage: 10, currentPage: 0 },
        mockAuthenticatedUser,
        "search",
        AllowedOrderByGetProjects.NAME,
        SortDirection.ASC,
      );

      expect(result).toBe(mockPaginatedResponse);
      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        mockOrgId,
        "test-user-id",
        MemberRole.USER,
      );
      expect(projectsRepository.getManyProjects).toHaveBeenCalledWith(
        mockOrgId,
        0,
        10,
        "search",
      );
    });
  });

  describe("delete", () => {
    it("should throw NotAuthorized when user lacks permission", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw EntityNotFound when project does not belong to organization", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.doesProjectBelongToOrg.mockRejectedValue(
        new EntityNotFound(),
      );

      await expect(
        service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw EntityNotFound when membership not found", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.doesProjectBelongToOrg.mockResolvedValue(undefined);
      jest
        .spyOn(membershipsRepository, "getMembershipRole")
        .mockResolvedValue(null as any);

      await expect(
        service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw NotAuthorized when user is not authorized to delete", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.doesProjectBelongToOrg.mockResolvedValue(undefined);
      jest.spyOn(membershipsRepository, "getMembershipRole").mockResolvedValue({
        role: MemberRole.USER,
      } as any);
      projectsRepository.getProjectById.mockResolvedValue({
        id: mockProjectId,
        added_by: { id: "different-user-id" },
      } as any);

      await expect(
        service.delete(mockOrgId, mockProjectId, mockAuthenticatedUser),
      ).rejects.toThrow(NotAuthorized);
    });
  });
});
