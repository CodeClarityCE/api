import { Test, type TestingModule } from "@nestjs/testing";
import { mkdir } from "fs/promises";

import {
  AllowedOrderByGetProjects,
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";

import { AnalysisResultsRepository } from "../../codeclarity_modules/results/results.repository";
import {
  EntityNotFound,
  IntegrationInvalidToken,
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
import { ProjectService } from "./projects.service";

// The import creates the project's download folder; keep the filesystem out
// of unit tests.
jest.mock("fs/promises", () => ({
  ...jest.requireActual("fs/promises"),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

describe("ProjectService", () => {
  let service: ProjectService;
  let membershipsRepository: MembershipsRepository;
  let integrationsRepository: jest.Mocked<IntegrationsRepository>;
  let projectsRepository: jest.Mocked<ProjectsRepository>;
  let githubRepositoriesService: jest.Mocked<GithubRepositoriesService>;
  let gitlabRepositoriesService: jest.Mocked<GitlabRepositoriesService>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let organizationsRepository: jest.Mocked<OrganizationsRepository>;

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
            getGithubRepositoryRemote: jest.fn(),
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
            getProjectByUrlOrgAndUser: jest.fn(),
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
    githubRepositoriesService = module.get(GithubRepositoriesService);
    gitlabRepositoriesService = module.get(GitlabRepositoriesService);
    usersRepository = module.get(UsersRepository);
    organizationsRepository = module.get(OrganizationsRepository);
    jest.mocked(mkdir).mockClear();
  });

  describe("import", () => {
    /** A GitHub import whose repository is not in the token owner's cache. */
    function arrangeGithubImportOutsideCache(): ProjectImportBody {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.getProjectByUrlOrgAndUser.mockResolvedValue(null);
      integrationsRepository.getIntegrationByIdAndOrganizationAndUser.mockResolvedValue(
        {
          id: mockIntegrationId,
          integration_provider: "GITHUB" as IntegrationProvider,
        } as any,
      );
      githubRepositoriesService.getGithubRepository.mockRejectedValue(
        new EntityNotFound(),
      );
      usersRepository.getUserById.mockResolvedValue({
        id: "test-user-id",
      } as any);
      organizationsRepository.getOrganizationById.mockResolvedValue({
        id: mockOrgId,
      } as any);
      projectsRepository.saveProject.mockImplementation(
        async (project: Project) => ({ ...project, id: "new-project-id" }),
      );
      return {
        url: "https://github.com/octo/legacy",
        integration_id: mockIntegrationId,
      } as ProjectImportBody;
    }

    it("resolves a repository missing from the cache through GitHub and keeps its default branch", async () => {
      const body = arrangeGithubImportOutsideCache();
      githubRepositoriesService.getGithubRepositoryRemote.mockResolvedValue({
        url: "https://github.com/octo/legacy",
        fully_qualified_name: "octo/legacy",
        description: "Legacy project",
        default_branch: "master",
        service_domain: "github.com",
      } as any);

      const result = await service.import(
        mockOrgId,
        body,
        mockAuthenticatedUser,
      );

      expect(result).toBe("new-project-id");
      expect(
        githubRepositoriesService.getGithubRepositoryRemote,
      ).toHaveBeenCalledWith(mockIntegrationId, body.url);
      const saved = projectsRepository.saveProject.mock.calls[0]![0];
      expect(saved.default_branch).toBe("master");
      expect(saved.name).toBe("octo/legacy");
      expect(saved.description).toBe("Legacy project");
      expect(saved.url).toBe(body.url);
      expect(saved.type).toBe("GITHUB");
      expect(mkdir).toHaveBeenCalledTimes(1);
    });

    it("stores the canonical url when the typed url is spelled differently", async () => {
      const body = {
        ...arrangeGithubImportOutsideCache(),
        url: "https://github.com/Octo/Legacy/",
      };
      githubRepositoriesService.getGithubRepositoryRemote.mockResolvedValue({
        url: "https://github.com/octo/legacy",
        fully_qualified_name: "octo/legacy",
        description: "",
        default_branch: "master",
        service_domain: "github.com",
      } as any);

      await service.import(mockOrgId, body, mockAuthenticatedUser);

      expect(projectsRepository.getProjectByUrlOrgAndUser).toHaveBeenCalledWith(
        "https://github.com/octo/legacy",
        mockOrgId,
        "test-user-id",
      );
      const saved = projectsRepository.saveProject.mock.calls[0]![0];
      expect(saved.url).toBe("https://github.com/octo/legacy");
    });

    it("reuses the project already stored under the canonical url", async () => {
      const body = {
        ...arrangeGithubImportOutsideCache(),
        url: "https://github.com/octo/legacy.git",
      };
      githubRepositoriesService.getGithubRepositoryRemote.mockResolvedValue({
        url: "https://github.com/octo/legacy",
        fully_qualified_name: "octo/legacy",
        description: "",
        default_branch: "master",
        service_domain: "github.com",
      } as any);
      projectsRepository.getProjectByUrlOrgAndUser.mockImplementation(
        async (url: string) =>
          (url === "https://github.com/octo/legacy"
            ? { id: "existing-project-id" }
            : null) as Project,
      );

      const result = await service.import(
        mockOrgId,
        body,
        mockAuthenticatedUser,
      );

      expect(result).toBe("existing-project-id");
      expect(projectsRepository.saveProject).not.toHaveBeenCalled();
    });

    it("keeps the typed url for a public GitLab repository outside the cache", async () => {
      const body = arrangeGithubImportOutsideCache();
      body.url = "https://gitlab.com/octo/legacy";
      integrationsRepository.getIntegrationByIdAndOrganizationAndUser.mockResolvedValue(
        {
          id: mockIntegrationId,
          integration_provider: "GITLAB" as IntegrationProvider,
        } as any,
      );
      gitlabRepositoriesService.getGitlabRepository.mockRejectedValue(
        new EntityNotFound(),
      );
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("<html>octo/legacy</html>"));

      await service.import(mockOrgId, body, mockAuthenticatedUser);

      const saved = projectsRepository.saveProject.mock.calls[0]![0];
      expect(saved.url).toBe("https://gitlab.com/octo/legacy");
      fetchSpy.mockRestore();
    });

    it("propagates EntityNotFound when GitHub does not know the repository either", async () => {
      const body = arrangeGithubImportOutsideCache();
      githubRepositoriesService.getGithubRepositoryRemote.mockRejectedValue(
        new EntityNotFound(),
      );

      await expect(
        service.import(mockOrgId, body, mockAuthenticatedUser),
      ).rejects.toThrow(EntityNotFound);
      expect(projectsRepository.saveProject).not.toHaveBeenCalled();
    });

    it("does not fall back to GitHub when the cache lookup fails for another reason", async () => {
      const body = arrangeGithubImportOutsideCache();
      githubRepositoriesService.getGithubRepository.mockRejectedValue(
        new IntegrationInvalidToken(),
      );

      await expect(
        service.import(mockOrgId, body, mockAuthenticatedUser),
      ).rejects.toThrow(IntegrationInvalidToken);
      expect(
        githubRepositoriesService.getGithubRepositoryRemote,
      ).not.toHaveBeenCalled();
    });

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

    it("should reuse an existing project (idempotent) without creating a new one", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      projectsRepository.getProjectByUrlOrgAndUser.mockResolvedValue({
        id: "existing-project-id",
      } as Project);

      const projectImportBody: ProjectImportBody = {
        name: "Test Project",
        description: "A test project",
        url: "https://github.com/test/repo",
        integration_id: mockIntegrationId,
      };

      const result = await service.import(
        mockOrgId,
        projectImportBody,
        mockAuthenticatedUser,
      );

      expect(result).toBe("existing-project-id");
      expect(projectsRepository.getProjectByUrlOrgAndUser).toHaveBeenCalledWith(
        projectImportBody.url,
        mockOrgId,
        "test-user-id",
      );
      // No new project is created and the repo sync is skipped.
      expect(projectsRepository.saveProject).not.toHaveBeenCalled();
      expect(
        integrationsRepository.getIntegrationByIdAndOrganizationAndUser,
      ).not.toHaveBeenCalled();
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

  describe("batchDelete", () => {
    const analysesRepo = () =>
      service["repos"].analyses as jest.Mocked<AnalysesRepository>;
    const resultsRepo = () =>
      service["repos"].results as jest.Mocked<AnalysisResultsRepository>;
    const fileRepo = () => service["repos"].file as jest.Mocked<FileRepository>;

    beforeEach(() => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      jest
        .spyOn(membershipsRepository, "getMembershipRole")
        .mockResolvedValue({ role: MemberRole.OWNER } as any);
      (projectsRepository as any).getProjectsByIdsAndOrg = jest.fn();
      (projectsRepository as any).detachFromOrganization = jest
        .fn()
        .mockResolvedValue(undefined);
      (projectsRepository as any).deleteByIds = jest.fn().mockResolvedValue(0);
      (analysesRepo().getAnalysisIdsByProjectIds as any) = jest
        .fn()
        .mockResolvedValue([]);
      (analysesRepo().cancelByIds as any) = jest.fn().mockResolvedValue(0);
      (analysesRepo().deleteByIds as any) = jest.fn().mockResolvedValue(0);
      (resultsRepo().deleteByAnalysisIds as any) = jest
        .fn()
        .mockResolvedValue(0);
      (fileRepo().deleteByProjectIds as any) = jest.fn().mockResolvedValue(0);
    });

    it("returns not_found for ids that do not belong to the org", async () => {
      (projectsRepository as any).getProjectsByIdsAndOrg.mockResolvedValue([]);

      const res = await service.batchDelete(
        mockOrgId,
        ["missing-1", "missing-2"],
        mockAuthenticatedUser,
      );

      expect(res.succeeded).toBe(0);
      expect(res.failed).toBe(2);
      expect(res.results.every((r) => r.status === "not_found")).toBe(true);
      expect((projectsRepository as any).deleteByIds).not.toHaveBeenCalled();
    });

    it("cancels in-flight analyses then bulk-deletes owned projects", async () => {
      (projectsRepository as any).getProjectsByIdsAndOrg.mockResolvedValue([
        { id: "p1", added_by: { id: "someone" } },
        { id: "p2", added_by: { id: "someone" } },
      ]);
      (analysesRepo().getAnalysisIdsByProjectIds as any).mockResolvedValue([
        "a1",
      ]);

      const res = await service.batchDelete(
        mockOrgId,
        ["p1", "p2"],
        mockAuthenticatedUser,
      );

      expect(res.succeeded).toBe(2);
      expect(res.failed).toBe(0);
      expect(analysesRepo().cancelByIds).toHaveBeenCalledWith(["a1"]);
      expect(resultsRepo().deleteByAnalysisIds).toHaveBeenCalledWith(["a1"]);
      expect(analysesRepo().deleteByIds).toHaveBeenCalledWith(["a1"]);
      expect(
        (projectsRepository as any).detachFromOrganization,
      ).toHaveBeenCalledWith(mockOrgId, ["p1", "p2"]);
      expect((projectsRepository as any).deleteByIds).toHaveBeenCalledWith([
        "p1",
        "p2",
      ]);
    });

    it("denies a USER deleting a project they did not import", async () => {
      jest
        .spyOn(membershipsRepository, "getMembershipRole")
        .mockResolvedValue({ role: MemberRole.USER } as any);
      (projectsRepository as any).getProjectsByIdsAndOrg.mockResolvedValue([
        { id: "p1", added_by: { id: "another-user" } },
      ]);

      const res = await service.batchDelete(
        mockOrgId,
        ["p1"],
        mockAuthenticatedUser,
      );

      expect(res.results).toEqual([{ id: "p1", status: "not_authorized" }]);
      expect((projectsRepository as any).deleteByIds).not.toHaveBeenCalled();
    });
  });
});
