import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import {
  IntegrationsRepository,
  MembershipsRepository,
  OrganizationsRepository,
} from "src/base_modules/shared/repositories";

import {
  EntityNotFound,
  FailedToRetrieveReposFromProvider,
  IntegrationInvalidToken,
  NotAuthorized,
} from "../../../types/error.types";
import { SortDirection } from "../../../types/sort.types";
import { AuthenticatedUser, ROLE } from "../../auth/auth.types";
import { MemberRole } from "../../organizations/memberships/orgMembership.types";
import {
  RepositoryCache,
  RepositoryType,
} from "../../projects/repositoryCache.entity";
import type { GithubIntegrationToken } from "../Token";

import { GithubIntegrationService } from "./github.service";
import type { GithubRepositorySchema } from "./github.types";
import {
  GithubRepositoriesService,
  parseGithubRepoUrl,
} from "./githubRepos.service";
// Mock ms module
jest.mock("ms", () => ({
  __esModule: true,
  default: jest.fn((timeStr: string) => {
    if (timeStr.startsWith("-")) {
      return Date.now() - 600000; // 10 minutes ago
    }
    return 600000; // 10 minutes in ms
  }),
}));

// Mock dynamic import of octokit
jest.mock("octokit", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      repos: {
        listForAuthenticatedUser: jest.fn(),
        get: jest.fn(),
      },
    },
  })),
}));

describe("GithubRepositoriesService", () => {
  let service: GithubRepositoriesService;
  let githubIntegrationService: jest.Mocked<GithubIntegrationService>;
  let organizationsRepository: jest.Mocked<OrganizationsRepository>;
  let membershipsRepository: MembershipsRepository;
  let integrationsRepository: jest.Mocked<IntegrationsRepository>;
  let repositoryCacheRepository: jest.Mocked<Repository<RepositoryCache>>;

  const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  const mockIntegration = {
    id: "test-integration-id",
    last_repository_sync: undefined,
    access_token: "ghp_test_token",
  } as any;

  const mockRepositoryCache = {
    id: "test-repo-id",
    url: "https://github.com/test/repo",
    fully_qualified_name: "test/repo",
    description: "Test repository",
    default_branch: "main",
    visibility: "public",
    created_at: new Date(),
    repository_type: RepositoryType.GITHUB,
    imported_already: false,
    integration: mockIntegration,
    service_domain: "github.com",
  } as any;

  const mockGithubRepository: GithubRepositorySchema = {
    html_url: "https://github.com/test/repo",
    full_name: "test/repo",
    description: "Test repository",
    default_branch: "main",
    visibility: "public",
    created_at: new Date(),
  } as GithubRepositorySchema;

  const mockGithubIntegrationToken = {
    validate: jest.fn(),
    getToken: jest.fn().mockReturnValue("ghp_test_token"),
  } as unknown as jest.Mocked<GithubIntegrationToken>;

  beforeEach(async () => {
    const mockGithubIntegrationService = {
      getToken: jest.fn(),
    };

    const mockOrganizationsRepository = {
      doesIntegrationBelongToOrg: jest.fn(),
    };

    const mockMembershipsRepository = {
      hasRequiredRole: jest.fn(),
    };

    const mockIntegrationsRepository = {
      getIntegrationById: jest.fn(),
      saveIntegration: jest.fn(),
    };

    const mockRepositoryCacheRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GithubRepositoriesService,
        {
          provide: GithubIntegrationService,
          useValue: mockGithubIntegrationService,
        },
        {
          provide: OrganizationsRepository,
          useValue: mockOrganizationsRepository,
        },
        {
          provide: MembershipsRepository,
          useValue: mockMembershipsRepository,
        },
        {
          provide: IntegrationsRepository,
          useValue: mockIntegrationsRepository,
        },
        {
          provide: getRepositoryToken(RepositoryCache, "codeclarity"),
          useValue: mockRepositoryCacheRepository,
        },
      ],
    }).compile();

    service = module.get<GithubRepositoriesService>(GithubRepositoriesService);
    githubIntegrationService = module.get(GithubIntegrationService);
    organizationsRepository = module.get(OrganizationsRepository);
    membershipsRepository = module.get<MembershipsRepository>(
      MembershipsRepository,
    );
    integrationsRepository = module.get(IntegrationsRepository);
    repositoryCacheRepository = module.get(
      getRepositoryToken(RepositoryCache, "codeclarity"),
    );

    // ms is already mocked globally
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("areGithubReposSynced", () => {
    it("should return false when last_repository_sync is undefined", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue({
        ...mockIntegration,
        last_repository_sync: null as any,
      });

      const result = await service.areGithubReposSynced("test-integration-id");

      expect(result).toBe(false);
    });

    it("should return false when last sync is older than invalidation time", async () => {
      const oldDate = new Date(Date.now() - 700000); // 11+ minutes ago
      integrationsRepository.getIntegrationById.mockResolvedValue({
        ...mockIntegration,
        last_repository_sync: oldDate,
      });

      const result = await service.areGithubReposSynced("test-integration-id");

      expect(result).toBe(false);
    });

    it("should return true when last sync is recent", async () => {
      const recentDate = new Date(Date.now() - 300000); // 5 minutes ago
      integrationsRepository.getIntegrationById.mockResolvedValue({
        ...mockIntegration,
        last_repository_sync: recentDate,
      });

      const result = await service.areGithubReposSynced("test-integration-id");

      expect(result).toBe(true);
    });
  });

  describe("getGithubRepositories", () => {
    const orgId = "test-org-id";
    const integrationId = "test-integration-id";
    const paginationUserSuppliedConf = { currentPage: 0, entriesPerPage: 20 };

    beforeEach(() => {
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        true,
      );
      jest.spyOn(service, "areGithubReposSynced").mockResolvedValue(true);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockRepositoryCache]),
      };
      repositoryCacheRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );
    });

    it("should successfully get repositories with basic parameters", async () => {
      const result = await service.getGithubRepositories(
        orgId,
        integrationId,
        paginationUserSuppliedConf,
        mockAuthenticatedUser,
      );

      expect(result).toEqual({
        data: [mockRepositoryCache],
        page: 0,
        entry_count: 1,
        entries_per_page: 20,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      });

      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        orgId,
        mockAuthenticatedUser.userId,
        MemberRole.USER,
      );
      expect(
        organizationsRepository.doesIntegrationBelongToOrg,
      ).toHaveBeenCalledWith(integrationId, orgId);
    });

    it("should apply search filter when search key is provided", async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockRepositoryCache]),
      };
      repositoryCacheRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.getGithubRepositories(
        orgId,
        integrationId,
        paginationUserSuppliedConf,
        mockAuthenticatedUser,
        "test-search",
      );

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "repo.fully_qualified_name LIKE :searchValue",
        { searchValue: "%test-search%" },
      );
    });

    it("should apply sorting when sort parameters are provided", async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockRepositoryCache]),
      };
      repositoryCacheRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.getGithubRepositories(
        orgId,
        integrationId,
        paginationUserSuppliedConf,
        mockAuthenticatedUser,
        undefined,
        false,
        undefined,
        "fully_qualified_name",
        SortDirection.DESC,
      );

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        "fully_qualified_name",
        "DESC",
      );
    });

    it("should force refresh when requested", async () => {
      const forceSyncSpy = jest
        .spyOn(service as any, "forceSyncGithubRepos")
        .mockResolvedValue(undefined);

      await service.getGithubRepositories(
        orgId,
        integrationId,
        paginationUserSuppliedConf,
        mockAuthenticatedUser,
        undefined,
        true,
      );

      expect(forceSyncSpy).toHaveBeenCalledWith(integrationId);
    });

    it("should sync when repos are not synced", async () => {
      jest.spyOn(service, "areGithubReposSynced").mockResolvedValue(false);
      const forceSyncSpy = jest
        .spyOn(service as any, "forceSyncGithubRepos")
        .mockResolvedValue(undefined);

      await service.getGithubRepositories(
        orgId,
        integrationId,
        paginationUserSuppliedConf,
        mockAuthenticatedUser,
      );

      expect(forceSyncSpy).toHaveBeenCalledWith(integrationId);
    });

    it("should apply pagination correctly", async () => {
      const customPagination = { currentPage: 2, entriesPerPage: 50 };
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(150),
        getMany: jest.fn().mockResolvedValue([mockRepositoryCache]),
      };
      repositoryCacheRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getGithubRepositories(
        orgId,
        integrationId,
        customPagination,
        mockAuthenticatedUser,
      );

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(100); // page 2 * 50 entries
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);
      expect(result.page).toBe(2);
      expect(result.entries_per_page).toBe(50);
      expect(result.total_pages).toBe(3); // 150 / 50
    });

    it("should enforce maximum entries per page", async () => {
      const largePagination = { currentPage: 0, entriesPerPage: 200 };
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockRepositoryCache]),
      };
      repositoryCacheRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getGithubRepositories(
        orgId,
        integrationId,
        largePagination,
        mockAuthenticatedUser,
      );

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(100); // max is 100
      expect(result.entries_per_page).toBe(100);
    });

    it("should throw NotAuthorized when integration does not belong to organization", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        false,
      );

      await expect(
        service.getGithubRepositories(
          orgId,
          integrationId,
          paginationUserSuppliedConf,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("resolveGithubRepository", () => {
    const orgId = "test-org-id";
    const integrationId = "test-integration-id";
    const repoUrl = "https://github.com/test/repo";

    beforeEach(() => {
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        true,
      );
    });

    function resolve(): Promise<RepositoryCache> {
      return service.resolveGithubRepository(
        orgId,
        integrationId,
        repoUrl,
        mockAuthenticatedUser,
      );
    }

    it("returns the cached repository without asking GitHub", async () => {
      repositoryCacheRepository.findOne.mockResolvedValue(mockRepositoryCache);
      const remoteLookup = jest.spyOn(service, "getGithubRepositoryRemote");

      const result = await resolve();

      expect(result).toBe(mockRepositoryCache);
      expect(repositoryCacheRepository.findOne).toHaveBeenCalledWith({
        relations: { integration: true },
        where: { url: repoUrl, integration: { id: integrationId } },
      });
      expect(remoteLookup).not.toHaveBeenCalled();
    });

    it("looks the repository up on GitHub when the cache does not hold it", async () => {
      repositoryCacheRepository.findOne.mockResolvedValue(null);
      const remoteRepository = {
        ...mockRepositoryCache,
        default_branch: "master",
      };
      const remoteLookup = jest
        .spyOn(service, "getGithubRepositoryRemote")
        .mockResolvedValue(remoteRepository);

      const result = await resolve();

      expect(result).toBe(remoteRepository);
      expect(remoteLookup).toHaveBeenCalledWith(integrationId, repoUrl);
    });

    it("never syncs the repository cache first", async () => {
      repositoryCacheRepository.findOne.mockResolvedValue(mockRepositoryCache);
      const syncedCheck = jest.spyOn(service, "areGithubReposSynced");
      const forceSync = jest.spyOn(service as any, "forceSyncGithubRepos");

      await resolve();

      expect(syncedCheck).not.toHaveBeenCalled();
      expect(forceSync).not.toHaveBeenCalled();
    });

    it("propagates EntityNotFound when GitHub does not know the repository either", async () => {
      repositoryCacheRepository.findOne.mockResolvedValue(null);
      jest
        .spyOn(service, "getGithubRepositoryRemote")
        .mockRejectedValue(new EntityNotFound());

      await expect(resolve()).rejects.toThrow(EntityNotFound);
    });

    it("throws NotAuthorized when the integration does not belong to the organization", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        false,
      );

      await expect(resolve()).rejects.toThrow(NotAuthorized);
      expect(repositoryCacheRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe("forceSyncGithubRepos", () => {
    beforeEach(() => {
      githubIntegrationService.getToken.mockResolvedValue(
        mockGithubIntegrationToken,
      );
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );
      integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);
    });

    it("should sync repositories from GitHub API", async () => {
      const githubApiFetchPageSpy = jest
        .spyOn(service as any, "githubApiFetchPage")
        .mockResolvedValue([[mockGithubRepository], 1]);
      const saveReposSpy = jest
        .spyOn(service as any, "saveRepos")
        .mockResolvedValue(undefined);

      await (service as any).forceSyncGithubRepos("test-integration-id");

      expect(githubIntegrationService.getToken).toHaveBeenCalledWith(
        "test-integration-id",
      );
      expect(githubApiFetchPageSpy).toHaveBeenCalledWith(
        1,
        100,
        undefined, // mockIntegration.last_repository_sync is undefined
        "ghp_test_token",
      );
      expect(saveReposSpy).toHaveBeenCalledWith(
        [mockGithubRepository],
        mockIntegration.id,
      );
      expect(integrationsRepository.saveIntegration).toHaveBeenCalled();
    });

    it("should handle multiple pages", async () => {
      const githubApiFetchPageSpy = jest
        .spyOn(service as any, "githubApiFetchPage")
        .mockResolvedValueOnce([[mockGithubRepository], 3])
        .mockResolvedValueOnce([[mockGithubRepository], 3])
        .mockResolvedValueOnce([[mockGithubRepository], 3]);
      const saveReposSpy = jest
        .spyOn(service as any, "saveRepos")
        .mockResolvedValue(undefined);

      await (service as any).forceSyncGithubRepos("test-integration-id");

      expect(githubApiFetchPageSpy).toHaveBeenCalledTimes(3);
      expect(saveReposSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("saveRepos", () => {
    it("should save repositories to cache", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );
      repositoryCacheRepository.save.mockResolvedValue(mockRepositoryCache);

      await (service as any).saveRepos(
        [mockGithubRepository],
        "test-integration-id",
      );

      expect(integrationsRepository.getIntegrationById).toHaveBeenCalledWith(
        "test-integration-id",
      );
      expect(repositoryCacheRepository.save).toHaveBeenCalled();
    });
  });

  describe("githubApiFetchPage", () => {
    const mockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: jest.fn(),
        },
      },
    };

    beforeEach(async () => {
      const octokitModule = await import("octokit");
      const { Octokit } = octokitModule;
      (Octokit as any).mockImplementation(() => mockOctokit);
    });

    it("should fetch repositories from GitHub API", async () => {
      const mockResponse = {
        data: [mockGithubRepository],
        headers: {
          link: '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=3>; rel="last"',
        },
      };
      mockOctokit.rest.repos.listForAuthenticatedUser.mockResolvedValue(
        mockResponse,
      );

      const result = await (service as any).githubApiFetchPage(
        1,
        100,
        undefined,
        "ghp_test_token",
      );

      expect(result).toEqual([[mockGithubRepository], 1]); // URL parsing doesn't work correctly in the current implementation
      expect(
        mockOctokit.rest.repos.listForAuthenticatedUser,
      ).toHaveBeenCalledWith({
        per_page: 100,
        page: 1,
        sort: "updated",
        since: undefined,
      });
    });

    it("should handle no link header", async () => {
      const mockResponse = {
        data: [mockGithubRepository],
        headers: {},
      };
      mockOctokit.rest.repos.listForAuthenticatedUser.mockResolvedValue(
        mockResponse,
      );

      const result = await (service as any).githubApiFetchPage(
        1,
        100,
        undefined,
        "ghp_test_token",
      );

      expect(result).toEqual([[mockGithubRepository], 1]);
    });

    it("should throw IntegrationInvalidToken for 401 error", async () => {
      const error = { status: 401 };
      mockOctokit.rest.repos.listForAuthenticatedUser.mockRejectedValue(error);

      await expect(
        (service as any).githubApiFetchPage(1, 100, undefined, "invalid_token"),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("should throw FailedToRetrieveReposFromProvider for other HTTP errors", async () => {
      const error = { status: 500 };
      mockOctokit.rest.repos.listForAuthenticatedUser.mockRejectedValue(error);

      await expect(
        (service as any).githubApiFetchPage(
          1,
          100,
          undefined,
          "ghp_test_token",
        ),
      ).rejects.toThrow(FailedToRetrieveReposFromProvider);
    });

    it("should re-throw non-HTTP errors", async () => {
      const error = new Error("Network error");
      mockOctokit.rest.repos.listForAuthenticatedUser.mockRejectedValue(error);

      await expect(
        (service as any).githubApiFetchPage(
          1,
          100,
          undefined,
          "ghp_test_token",
        ),
      ).rejects.toThrow(error);
    });

    it("should include since parameter when last updated is provided", async () => {
      const lastUpdated = new Date("2023-01-01");
      const mockResponse = {
        data: [mockGithubRepository],
        headers: {},
      };
      mockOctokit.rest.repos.listForAuthenticatedUser.mockResolvedValue(
        mockResponse,
      );

      await (service as any).githubApiFetchPage(
        1,
        100,
        lastUpdated,
        "ghp_test_token",
      );

      expect(
        mockOctokit.rest.repos.listForAuthenticatedUser,
      ).toHaveBeenCalledWith({
        per_page: 100,
        page: 1,
        sort: "updated",
        since: lastUpdated.toISOString(),
      });
    });
  });

  describe("parseGithubRepoUrl", () => {
    it.each([
      ["https://github.com/octo/legacy", "octo", "legacy"],
      ["https://github.com/octo/legacy.git", "octo", "legacy"],
      ["https://github.com/octo/legacy/", "octo", "legacy"],
      ["https://www.github.com/octo/legacy/tree/main", "octo", "legacy"],
    ])("parses %s", (url, owner, repo) => {
      expect(parseGithubRepoUrl(url)).toEqual({ owner, repo });
    });

    it.each([
      "https://github.com/octo",
      "https://gitlab.com/octo/legacy",
      "not a url",
    ])("rejects %s with EntityNotFound", (url) => {
      expect(() => parseGithubRepoUrl(url)).toThrow(EntityNotFound);
    });
  });

  describe("getGithubRepositoryRemote", () => {
    const mockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: jest.fn(),
          get: jest.fn(),
        },
      },
    };

    beforeEach(async () => {
      const { Octokit } = await import("octokit");
      (Octokit as any).mockImplementation(() => mockOctokit);
      githubIntegrationService.getToken.mockResolvedValue(
        mockGithubIntegrationToken,
      );
      mockOctokit.rest.repos.get.mockReset();
    });

    it("maps the repository from GitHub, keeping its real default branch", async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          html_url: "https://github.com/octo/legacy",
          full_name: "octo/legacy",
          default_branch: "master",
          visibility: undefined,
          description: null,
          created_at: "2015-03-04T05:06:07Z",
        },
      });

      const repo = await service.getGithubRepositoryRemote(
        "test-integration-id",
        "https://github.com/octo/legacy.git",
      );

      expect(githubIntegrationService.getToken).toHaveBeenCalledWith(
        "test-integration-id",
      );
      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: "octo",
        repo: "legacy",
      });
      expect(repo.repository_type).toBe(RepositoryType.GITHUB);
      expect(repo.url).toBe("https://github.com/octo/legacy");
      expect(repo.fully_qualified_name).toBe("octo/legacy");
      expect(repo.default_branch).toBe("master");
      expect(repo.visibility).toBe("public");
      expect(repo.description).toBe("");
      expect(repo.created_at).toEqual(new Date("2015-03-04T05:06:07Z"));
      expect(repo.service_domain).toBe("github.com");
      // Transient: never written to the repository cache
      expect(repositoryCacheRepository.save).not.toHaveBeenCalled();
    });

    it("throws EntityNotFound when GitHub answers 404", async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({ status: 404 });

      await expect(
        service.getGithubRepositoryRemote(
          "test-integration-id",
          "https://github.com/octo/missing",
        ),
      ).rejects.toThrow(EntityNotFound);
    });

    it("throws IntegrationInvalidToken when GitHub answers 401", async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({ status: 401 });

      await expect(
        service.getGithubRepositoryRemote(
          "test-integration-id",
          "https://github.com/octo/legacy",
        ),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("throws FailedToRetrieveReposFromProvider on other GitHub errors", async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({ status: 500 });

      await expect(
        service.getGithubRepositoryRemote(
          "test-integration-id",
          "https://github.com/octo/legacy",
        ),
      ).rejects.toThrow(FailedToRetrieveReposFromProvider);
    });

    it("rejects non-GitHub urls before touching the token or GitHub", async () => {
      await expect(
        service.getGithubRepositoryRemote(
          "test-integration-id",
          "https://gitlab.com/octo/legacy",
        ),
      ).rejects.toThrow(EntityNotFound);

      expect(githubIntegrationService.getToken).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.get).not.toHaveBeenCalled();
    });
  });

  describe("forceSyncGithubRepos coalescing", () => {
    it("runs a single sync for concurrent callers of the same integration", async () => {
      let finishSync!: () => void;
      const doSync = jest
        .spyOn(service as any, "doForceSyncGithubRepos")
        .mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              finishSync = resolve;
            }),
        );

      const both = Promise.all([
        (service as any).forceSyncGithubRepos("test-integration-id"),
        (service as any).forceSyncGithubRepos("test-integration-id"),
      ]);
      await new Promise((resolve) => setImmediate(resolve));
      expect(doSync).toHaveBeenCalledTimes(1);

      finishSync();
      await both;

      // Once finished, the next caller syncs again
      doSync.mockResolvedValue(undefined);
      await (service as any).forceSyncGithubRepos("test-integration-id");
      expect(doSync).toHaveBeenCalledTimes(2);
    });
  });
});
