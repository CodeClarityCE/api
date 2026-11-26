import { Test, type TestingModule } from "@nestjs/testing";
import { lookup } from "dns/promises";
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
  ImportTargetNotAllowed,
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
import { ProjectRowsService } from "./project-rows.service";
import { ProjectMemberService } from "./projectMember.service";
import { ProjectService } from "./projects.service";
import type { RepositoryCache } from "./repositoryCache.entity";

// The import creates the project's download folder; keep the filesystem out
// of unit tests.
jest.mock("fs/promises", () => ({
  ...jest.requireActual("fs/promises"),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

// Name resolution is the network boundary of the import's public-repo check.
jest.mock("dns/promises", () => ({ lookup: jest.fn() }));
const mockedLookup = lookup as unknown as jest.Mock;

// The pinned fetch keeps its real address checks; only the socket is faked.
const mockTransport = jest.fn<Promise<Response>, [URL]>();
jest.mock("src/utils/outbound-url", () => {
  const actual = jest.requireActual("src/utils/outbound-url");
  return {
    ...actual,
    pinnedFetch: async (url: string, init: object) => {
      const vetted = await actual.resolveOutboundUrl(url, init);
      return mockTransport(vetted.url);
    },
  };
});

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
        ProjectRowsService,
        {
          provide: OrganizationLoggerService,
          useValue: {
            addAuditLog: jest.fn().mockResolvedValue(null),
            addActorAuditLog: jest.fn().mockResolvedValue(null),
          },
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
            resolveGithubRepository: jest.fn(),
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
            // A member's check, as the real method does for users.
            hasRequiredRoleFor: jest.fn(function (
              this: { hasRequiredRole: (...args: unknown[]) => unknown },
              orgId: string,
              actor: { userId: string },
              role: unknown,
            ) {
              return this.hasRequiredRole(orgId, actor.userId, role);
            }),
            getMembershipRole: jest.fn(),
          },
        },
        {
          provide: FileRepository,
          useValue: { remove: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: IntegrationsRepository,
          useValue: {
            getIntegrationByIdAndOrganizationAndUser: jest.fn(),
            getIntegrationByIdAndOrganization: jest.fn(),
          },
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
            getProjectByUrlAndOrg: jest.fn(),
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
    const legacyRepository = {
      url: "https://github.com/octo/legacy",
      fully_qualified_name: "octo/legacy",
      description: "Legacy project",
      default_branch: "master",
      service_domain: "github.com",
    } as RepositoryCache;

    /** A GitHub import whose repository resolves to `legacyRepository`. */
    function arrangeGithubImport(): ProjectImportBody {
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
      githubRepositoriesService.resolveGithubRepository.mockResolvedValue(
        legacyRepository,
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

    it("imports the repository the GitHub service resolves, keeping its default branch", async () => {
      const body = arrangeGithubImport();

      const result = await service.import(
        mockOrgId,
        body,
        mockAuthenticatedUser,
      );

      expect(result).toBe("new-project-id");
      expect(
        githubRepositoriesService.resolveGithubRepository,
      ).toHaveBeenCalledWith(
        mockOrgId,
        mockIntegrationId,
        body.url,
        mockAuthenticatedUser,
      );
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
        ...arrangeGithubImport(),
        url: "https://github.com/Octo/Legacy/",
      };

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
        ...arrangeGithubImport(),
        url: "https://github.com/octo/legacy.git",
      };
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

    describe("of a GitLab url outside the repository cache", () => {
      const savedAllowlist = process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];

      function arrangeGitlabFallback(
        url: string,
        resolvesTo: string[],
        serviceDomain = new URL(url).origin,
      ): ProjectImportBody {
        const body = { ...arrangeGithubImport(), url };
        integrationsRepository.getIntegrationByIdAndOrganizationAndUser.mockResolvedValue(
          {
            id: mockIntegrationId,
            integration_provider: "GITLAB" as IntegrationProvider,
            service_domain: serviceDomain,
          } as any,
        );
        gitlabRepositoriesService.getGitlabRepository.mockRejectedValue(
          new EntityNotFound(),
        );
        mockedLookup.mockResolvedValue(
          resolvesTo.map((address) => ({
            address,
            family: address.includes(":") ? 6 : 4,
          })),
        );
        mockTransport.mockResolvedValue(
          new Response("<html>octo/legacy</html>"),
        );
        return body;
      }

      afterEach(() => {
        mockTransport.mockReset();
        mockedLookup.mockReset();
        if (savedAllowlist === undefined)
          delete process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
        else process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = savedAllowlist;
      });

      it("keeps the typed url of a public gitlab.com repository", async () => {
        const body = arrangeGitlabFallback("https://gitlab.com/octo/legacy", [
          "172.65.251.78",
          "2606:4700:90:0:f22e:fbec:5bed:a9b9",
        ]);

        await service.import(mockOrgId, body, mockAuthenticatedUser);

        const saved = projectsRepository.saveProject.mock.calls[0]![0];
        expect(saved.url).toBe("https://gitlab.com/octo/legacy");
        expect(saved.name).toBe("octo/legacy");
      });

      it("stores the integration's service domain", async () => {
        const body = arrangeGitlabFallback(
          "https://gitlab.example.org/team/app",
          ["203.0.113.20"],
          "https://gitlab.example.org/",
        );

        await service.import(mockOrgId, body, mockAuthenticatedUser);

        const saved = projectsRepository.saveProject.mock.calls[0]![0];
        expect(saved.service_domain).toBe("https://gitlab.example.org/");
        expect(saved.name).toBe("team/app");
      });

      it("refuses a url on another host than the integration's, before any request", async () => {
        const body = arrangeGitlabFallback(
          "https://elsewhere.example/a/b",
          ["203.0.113.20"],
          "https://gitlab.com",
        );

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(ImportTargetNotAllowed);
        expect(mockTransport).not.toHaveBeenCalled();
        expect(mockedLookup).not.toHaveBeenCalled();
        expect(
          gitlabRepositoriesService.syncGitlabRepos,
        ).not.toHaveBeenCalled();
        expect(
          gitlabRepositoriesService.getGitlabRepository,
        ).not.toHaveBeenCalled();
        expect(projectsRepository.saveProject).not.toHaveBeenCalled();
      });

      it.each([
        ["another port", "https://gitlab.com:8443/a/b"],
        ["plain http", "http://gitlab.com/a/b"],
        ["an unparseable url", "not a url"],
      ])("refuses a url on %s of the integration's host", async (_l, url) => {
        const body = arrangeGitlabFallback(
          "https://gitlab.com/a/b",
          ["172.65.251.78"],
          "https://gitlab.com",
        );
        body.url = url;

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(ImportTargetNotAllowed);
        expect(mockTransport).not.toHaveBeenCalled();
      });

      it("names the project below a GitLab served on a subpath", async () => {
        const body = arrangeGitlabFallback(
          "https://example.org/gitlab/team/app.git",
          ["203.0.113.20"],
          "https://example.org/gitlab",
        );

        await service.import(mockOrgId, body, mockAuthenticatedUser);

        const saved = projectsRepository.saveProject.mock.calls[0]![0];
        expect(saved.name).toBe("team/app");
      });

      it("refuses a host that resolves to a loopback address", async () => {
        const body = arrangeGitlabFallback("https://evil.example/a/b", [
          "127.0.0.1",
        ]);

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(ImportTargetNotAllowed);
        expect(mockTransport).not.toHaveBeenCalled();
        expect(projectsRepository.saveProject).not.toHaveBeenCalled();
      });

      it.each([
        ["private IPv4", "https://evil.example/a/b", ["10.1.2.3"]],
        ["private 172.16/12", "https://evil.example/a/b", ["172.20.0.5"]],
        ["private 192.168/16", "https://evil.example/a/b", ["192.168.1.1"]],
        ["cloud metadata", "https://evil.example/a/b", ["169.254.169.254"]],
        [
          "shared address space",
          "https://evil.example/a/b",
          ["100.100.100.200"],
        ],
        ["unspecified", "https://evil.example/a/b", ["0.0.0.0"]],
        ["IPv6 loopback", "https://evil.example/a/b", ["::1"]],
        ["IPv6 unique local", "https://evil.example/a/b", ["fd00:ec2::254"]],
        ["IPv6 link-local", "https://evil.example/a/b", ["fe80::1"]],
        ["IPv4-mapped IPv6", "https://evil.example/a/b", ["::ffff:10.0.0.1"]],
        [
          "one internal address among public ones",
          "https://evil.example/a/b",
          ["8.8.8.8", "127.0.0.1"],
        ],
        ["an IPv4 literal", "http://127.0.0.1:8080/a/b", []],
        ["a decimal IPv4 literal", "http://2130706433/a/b", []],
        ["an IPv4-mapped IPv6 literal", "http://[::ffff:169.254.169.254]/", []],
        ["an IPv6 literal", "http://[::1]/a/b", []],
      ])("refuses %s", async (_label, url, resolvesTo) => {
        const body = arrangeGitlabFallback(url, resolvesTo);

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(ImportTargetNotAllowed);
        expect(mockTransport).not.toHaveBeenCalled();
      });

      it("refuses a url that is not http(s)", async () => {
        const body = arrangeGitlabFallback(
          "file:///etc/passwd",
          [],
          "https://gitlab.com",
        );

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(ImportTargetNotAllowed);
        expect(mockTransport).not.toHaveBeenCalled();
      });

      it("refuses a host that does not resolve", async () => {
        const body = arrangeGitlabFallback("https://nowhere.invalid/a/b", []);
        mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(ImportTargetNotAllowed);
        expect(mockTransport).not.toHaveBeenCalled();
      });

      it("allows a self-hosted GitLab on a private address when the operator allows its host", async () => {
        process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"] = "gitlab.internal.lan";
        const body = arrangeGitlabFallback(
          "https://gitlab.internal.lan/team/app",
          ["10.0.0.7"],
          "https://gitlab.internal.lan/",
        );

        await service.import(mockOrgId, body, mockAuthenticatedUser);

        expect(mockTransport).toHaveBeenCalledTimes(1);
        const saved = projectsRepository.saveProject.mock.calls[0]![0];
        expect(saved.url).toBe("https://gitlab.internal.lan/team/app");
      });

      it("refuses a self-hosted GitLab on a private address the operator did not allow", async () => {
        delete process.env["GITLAB_ALLOWED_PRIVATE_HOSTS"];
        const body = arrangeGitlabFallback(
          "https://gitlab.internal.lan/team/app",
          ["10.0.0.7"],
          "https://gitlab.internal.lan/",
        );

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(ImportTargetNotAllowed);
        expect(mockTransport).not.toHaveBeenCalled();
      });

      it("does not follow redirects of the public check", async () => {
        const body = arrangeGitlabFallback("https://gitlab.com/octo/legacy", [
          "172.65.251.78",
        ]);
        mockTransport.mockResolvedValue(
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/" },
          }),
        );

        await expect(
          service.import(mockOrgId, body, mockAuthenticatedUser),
        ).rejects.toThrow(EntityNotFound);
        expect(mockTransport).toHaveBeenCalledTimes(1);
      });
    });

    it("propagates the error when the GitHub repository cannot be resolved", async () => {
      const body = arrangeGithubImport();
      githubRepositoriesService.resolveGithubRepository.mockRejectedValue(
        new EntityNotFound(),
      );

      await expect(
        service.import(mockOrgId, body, mockAuthenticatedUser),
      ).rejects.toThrow(EntityNotFound);
      expect(projectsRepository.saveProject).not.toHaveBeenCalled();
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

  describe("importForExperiment", () => {
    const repo = {
      url: "https://github.com/octo/app",
      full_name: "octo/app",
      description: "An app",
      default_branch: "main",
    };

    beforeEach(() => {
      projectsRepository.getProjectByUrlAndOrg.mockResolvedValue(null);
      integrationsRepository.getIntegrationByIdAndOrganization.mockResolvedValue(
        {
          id: mockIntegrationId,
          integration_provider: "GITHUB" as IntegrationProvider,
        } as any,
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
    });

    it("reuses a project any member of the org imported from the url", async () => {
      projectsRepository.getProjectByUrlAndOrg.mockResolvedValue({
        id: "colleague-project-id",
      } as Project);

      await expect(
        service.importForExperiment(
          mockOrgId,
          mockIntegrationId,
          repo,
          mockAuthenticatedUser,
        ),
      ).resolves.toBe("colleague-project-id");
      expect(projectsRepository.getProjectByUrlAndOrg).toHaveBeenCalledWith(
        repo.url,
        mockOrgId,
      );
      expect(projectsRepository.saveProject).not.toHaveBeenCalled();
    });

    it("imports through an org integration the caller does not own", async () => {
      await expect(
        service.importForExperiment(
          mockOrgId,
          mockIntegrationId,
          repo,
          mockAuthenticatedUser,
        ),
      ).resolves.toBe("new-project-id");

      expect(
        integrationsRepository.getIntegrationByIdAndOrganization,
      ).toHaveBeenCalledWith(mockIntegrationId, mockOrgId);
      expect(
        integrationsRepository.getIntegrationByIdAndOrganizationAndUser,
      ).not.toHaveBeenCalled();
      expect(
        githubRepositoriesService.resolveGithubRepository,
      ).not.toHaveBeenCalled();
      const saved = projectsRepository.saveProject.mock.calls[0]![0];
      expect(saved).toMatchObject({
        name: "octo/app",
        description: "An app",
        url: "https://github.com/octo/app",
        default_branch: "main",
        type: "GITHUB",
        service_domain: "github.com",
        added_by: { id: "test-user-id" },
      });
      expect(saved.integration?.id).toBe(mockIntegrationId);
      expect(mkdir).toHaveBeenCalledTimes(1);
    });

    it("refuses a caller who is not a member of the org", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.importForExperiment(
          mockOrgId,
          mockIntegrationId,
          repo,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
      expect(projectsRepository.saveProject).not.toHaveBeenCalled();
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
        .spyOn(membershipsRepository, "hasRequiredRoleFor")
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
        .spyOn(membershipsRepository, "hasRequiredRoleFor")
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
      expect(membershipsRepository.hasRequiredRoleFor).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
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
    const fileRepo = () => service["repos"].file as jest.Mocked<FileRepository>;
    const mockManager = { tx: true };
    let calls: string[];

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
      (projectsRepository as any).runInTransaction = jest.fn(
        (work: (m: unknown) => Promise<unknown>) => work(mockManager),
      );
      (analysesRepo().getAnalysisIdsByProjectIds as any) = jest
        .fn()
        .mockResolvedValue([]);
      calls = [];
      (analysesRepo().cancelByIds as any) = jest.fn(async () => {
        calls.push("cancel");
        return 0;
      });
      (analysesRepo().deleteByIds as any) = jest.fn(async () => {
        calls.push("delete");
        return 0;
      });
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

    it("bulk-deletes owned projects in one transaction", async () => {
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
      expect(analysesRepo().cancelByIds).toHaveBeenCalledWith(
        ["a1"],
        mockManager,
      );
      expect(analysesRepo().deleteByIds).toHaveBeenCalledWith(
        ["a1"],
        mockManager,
      );
      expect(calls).toEqual(["cancel", "delete"]);
      expect(fileRepo().deleteByProjectIds).toHaveBeenCalledWith(
        ["p1", "p2"],
        mockManager,
      );
      expect(
        (projectsRepository as any).detachFromOrganization,
      ).toHaveBeenCalledWith(mockOrgId, ["p1", "p2"], mockManager);
      expect((projectsRepository as any).deleteByIds).toHaveBeenCalledWith(
        ["p1", "p2"],
        mockManager,
      );
    });

    it("cancels running analyses before deleting a single project", async () => {
      projectsRepository.doesProjectBelongToOrg.mockResolvedValue(undefined);
      projectsRepository.getProjectById.mockResolvedValue({
        id: "p1",
        url: "https://example.com/p1",
        added_by: { id: "someone" },
      } as any);
      (analysesRepo().getAnalysisIdsByProjectIds as any).mockResolvedValue([
        "a1",
      ]);

      await service.delete(mockOrgId, "p1", mockAuthenticatedUser);

      expect(analysesRepo().cancelByIds).toHaveBeenCalledWith(
        ["a1"],
        mockManager,
      );
      expect(analysesRepo().deleteByIds).toHaveBeenCalledWith(
        ["a1"],
        mockManager,
      );
      expect(calls).toEqual(["cancel", "delete"]);
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
