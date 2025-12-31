import { Test, type TestingModule } from "@nestjs/testing";

import {
  DuplicateIntegration,
  EntityNotFound,
  FailedToRetrieveReposFromProvider,
  IntegrationInvalidToken,
  IntegrationTokenExpired,
  IntegrationTokenMissingPermissions,
  IntegrationTokenRetrievalFailed,
  IntegrationWrongTokenType,
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "../../../types/error.types";
import { SortDirection } from "../../../types/sort.types";
import { AuthenticatedUser, ROLE } from "../../auth/auth.types";
import type { RepositoryCache } from "../../projects/repositoryCache.entity";
import type { Integration } from "../integrations.entity";

import { GithubIntegrationController } from "./github.controller";
import { GithubIntegrationService } from "./github.service";
import {
  GithubTokenType,
  type LinkGithubCreateBody,
  type LinkGithubPatchBody,
} from "./githubIntegration.types";
import { GithubRepositoriesService } from "./githubRepos.service";

describe("GithubIntegrationController", () => {
  let controller: GithubIntegrationController;
  let githubIntegrationService: jest.Mocked<GithubIntegrationService>;
  let githubReposService: jest.Mocked<GithubRepositoriesService>;

  const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  const mockIntegration = {
    id: "test-integration-id",
    integration_provider: "GITHUB",
    integration_type: "VCS",
    access_token: "masked-token",
    token_type: GithubTokenType.CLASSIC_TOKEN,
    invalid: false,
    added_on: new Date(),
    service_domain: "github.com",
  } as Integration;

  const mockRepositoryCache = {
    id: "test-repo-id",
    url: "https://github.com/test/repo",
    fully_qualified_name: "test/repo",
    description: "Test repository",
    default_branch: "main",
    visibility: "public",
    created_at: new Date(),
    repository_type: "GITHUB",
    imported_already: false,
    service_domain: "github.com",
    integration: {} as any,
  } as RepositoryCache;

  beforeEach(async () => {
    const mockGithubIntegrationService = {
      addGithubIntegration: jest.fn(),
      getGithubIntegration: jest.fn(),
      modifyGithubIntegration: jest.fn(),
    };

    const mockGithubReposService = {
      getGithubRepositories: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GithubIntegrationController],
      providers: [
        {
          provide: GithubIntegrationService,
          useValue: mockGithubIntegrationService,
        },
        {
          provide: GithubRepositoriesService,
          useValue: mockGithubReposService,
        },
      ],
    }).compile();

    controller = module.get<GithubIntegrationController>(
      GithubIntegrationController,
    );
    githubIntegrationService = module.get(GithubIntegrationService);
    githubReposService = module.get(GithubRepositoriesService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("linkGithub", () => {
    it("should successfully add a GitHub integration", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "ghp_test_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";
      const expectedId = "test-integration-id";

      githubIntegrationService.addGithubIntegration.mockResolvedValue(
        expectedId,
      );

      const result = await controller.linkGithub(
        linkGithubCreate,
        mockAuthenticatedUser,
        orgId,
      );

      expect(result).toEqual({ id: expectedId });
      expect(
        githubIntegrationService.addGithubIntegration,
      ).toHaveBeenCalledWith(
        orgId,
        { ...linkGithubCreate, token_type: GithubTokenType.CLASSIC_TOKEN },
        mockAuthenticatedUser,
      );
    });

    it("should throw NotAuthorized when user lacks permissions", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "ghp_test_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";

      githubIntegrationService.addGithubIntegration.mockRejectedValue(
        new NotAuthorized(),
      );

      await expect(
        controller.linkGithub(linkGithubCreate, mockAuthenticatedUser, orgId),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw IntegrationWrongTokenType for invalid token type", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "invalid_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";

      githubIntegrationService.addGithubIntegration.mockRejectedValue(
        new IntegrationWrongTokenType(),
      );

      await expect(
        controller.linkGithub(linkGithubCreate, mockAuthenticatedUser, orgId),
      ).rejects.toThrow(IntegrationWrongTokenType);
    });

    it("should throw IntegrationTokenMissingPermissions for insufficient permissions", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "ghp_test_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";

      githubIntegrationService.addGithubIntegration.mockRejectedValue(
        new IntegrationTokenMissingPermissions(),
      );

      await expect(
        controller.linkGithub(linkGithubCreate, mockAuthenticatedUser, orgId),
      ).rejects.toThrow(IntegrationTokenMissingPermissions);
    });

    it("should throw IntegrationTokenExpired for expired token", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "ghp_expired_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";

      githubIntegrationService.addGithubIntegration.mockRejectedValue(
        new IntegrationTokenExpired(),
      );

      await expect(
        controller.linkGithub(linkGithubCreate, mockAuthenticatedUser, orgId),
      ).rejects.toThrow(IntegrationTokenExpired);
    });

    it("should throw IntegrationInvalidToken for invalid token", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "ghp_invalid_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";

      githubIntegrationService.addGithubIntegration.mockRejectedValue(
        new IntegrationInvalidToken(),
      );

      await expect(
        controller.linkGithub(linkGithubCreate, mockAuthenticatedUser, orgId),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("should throw DuplicateIntegration when integration already exists", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "ghp_test_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";

      githubIntegrationService.addGithubIntegration.mockRejectedValue(
        new DuplicateIntegration(),
      );

      await expect(
        controller.linkGithub(linkGithubCreate, mockAuthenticatedUser, orgId),
      ).rejects.toThrow(DuplicateIntegration);
    });

    it("should throw IntegrationTokenRetrievalFailed when token retrieval fails", async () => {
      const linkGithubCreate: LinkGithubCreateBody = {
        token: "ghp_test_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";

      githubIntegrationService.addGithubIntegration.mockRejectedValue(
        new IntegrationTokenRetrievalFailed(),
      );

      await expect(
        controller.linkGithub(linkGithubCreate, mockAuthenticatedUser, orgId),
      ).rejects.toThrow(IntegrationTokenRetrievalFailed);
    });
  });

  describe("getIntegration", () => {
    it("should successfully get a GitHub integration", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubIntegrationService.getGithubIntegration.mockResolvedValue(
        mockIntegration,
      );

      const result = await controller.getIntegration(
        mockAuthenticatedUser,
        orgId,
        integrationId,
      );

      expect(result).toEqual({ data: mockIntegration });
      expect(
        githubIntegrationService.getGithubIntegration,
      ).toHaveBeenCalledWith(orgId, integrationId, mockAuthenticatedUser);
    });

    it("should throw NotAuthorized when user lacks permissions", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubIntegrationService.getGithubIntegration.mockRejectedValue(
        new NotAuthorized(),
      );

      await expect(
        controller.getIntegration(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw EntityNotFound when integration does not exist", async () => {
      const orgId = "test-org-id";
      const integrationId = "non-existent-id";

      githubIntegrationService.getGithubIntegration.mockRejectedValue(
        new EntityNotFound(),
      );

      await expect(
        controller.getIntegration(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw NotAuthenticated when user is not authenticated", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubIntegrationService.getGithubIntegration.mockRejectedValue(
        new NotAuthenticated(),
      );

      await expect(
        controller.getIntegration(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(NotAuthenticated);
    });

    it("should throw InternalError for server errors", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubIntegrationService.getGithubIntegration.mockRejectedValue(
        new InternalError("TEST_ERROR", "Test error"),
      );

      await expect(
        controller.getIntegration(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(InternalError);
    });
  });

  describe("modifyGithubLink", () => {
    it("should successfully modify a GitHub integration", async () => {
      const linkGithubPatch: LinkGithubPatchBody = {
        token: "ghp_new_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubIntegrationService.modifyGithubIntegration.mockResolvedValue();

      const result = await controller.modifyGithubLink(
        linkGithubPatch,
        mockAuthenticatedUser,
        orgId,
        integrationId,
      );

      expect(result).toEqual({});
      expect(
        githubIntegrationService.modifyGithubIntegration,
      ).toHaveBeenCalledWith(
        orgId,
        integrationId,
        linkGithubPatch,
        mockAuthenticatedUser,
      );
    });

    it("should throw NotAuthorized when user lacks permissions", async () => {
      const linkGithubPatch: LinkGithubPatchBody = {
        token: "ghp_new_token",
        token_type: GithubTokenType.CLASSIC_TOKEN,
      };
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubIntegrationService.modifyGithubIntegration.mockRejectedValue(
        new NotAuthorized(),
      );

      await expect(
        controller.modifyGithubLink(
          linkGithubPatch,
          mockAuthenticatedUser,
          orgId,
          integrationId,
        ),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("getRepositories", () => {
    it("should successfully get repositories", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";
      const expectedResponse = {
        data: [mockRepositoryCache],
        page: 0,
        entry_count: 1,
        entries_per_page: 20,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      };

      githubReposService.getGithubRepositories.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.getRepositories(
        mockAuthenticatedUser,
        orgId,
        integrationId,
        0,
        20,
        "test",
        false,
        "private",
        "name",
        SortDirection.ASC,
      );

      expect(result).toEqual(expectedResponse);
      expect(githubReposService.getGithubRepositories).toHaveBeenCalledWith(
        orgId,
        integrationId,
        { currentPage: 0, entriesPerPage: 20 },
        mockAuthenticatedUser,
        "test",
        false,
        ["private"],
        "name",
        SortDirection.ASC,
      );
    });

    it("should use default values for optional parameters", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";
      const expectedResponse = {
        data: [mockRepositoryCache],
        page: 0,
        entry_count: 1,
        entries_per_page: 0,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      };

      githubReposService.getGithubRepositories.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.getRepositories(
        mockAuthenticatedUser,
        orgId,
        integrationId,
      );

      expect(result).toEqual(expectedResponse);
      expect(githubReposService.getGithubRepositories).toHaveBeenCalledWith(
        orgId,
        integrationId,
        { currentPage: undefined, entriesPerPage: undefined },
        mockAuthenticatedUser,
        undefined,
        undefined,
        [],
        undefined,
        undefined,
      );
    });

    it("should parse active_filters correctly", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";
      const expectedResponse = {
        data: [mockRepositoryCache],
        page: 0,
        entry_count: 1,
        entries_per_page: 20,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      };

      githubReposService.getGithubRepositories.mockResolvedValue(
        expectedResponse,
      );

      await controller.getRepositories(
        mockAuthenticatedUser,
        orgId,
        integrationId,
        0,
        20,
        undefined,
        false,
        "[private,public]",
      );

      expect(githubReposService.getGithubRepositories).toHaveBeenCalledWith(
        orgId,
        integrationId,
        { currentPage: 0, entriesPerPage: 20 },
        mockAuthenticatedUser,
        undefined,
        false,
        ["private", "public"],
        undefined,
        undefined,
      );
    });

    it("should throw NotAuthorized when user lacks permissions", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new NotAuthorized(),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw EntityNotFound when integration does not exist", async () => {
      const orgId = "test-org-id";
      const integrationId = "non-existent-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new EntityNotFound(),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw IntegrationInvalidToken for invalid token", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new IntegrationInvalidToken(),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(IntegrationInvalidToken);
    });

    it("should throw FailedToRetrieveReposFromProvider when API fails", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new FailedToRetrieveReposFromProvider(),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(FailedToRetrieveReposFromProvider);
    });

    it("should throw IntegrationTokenMissingPermissions for insufficient permissions", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new IntegrationTokenMissingPermissions(),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(IntegrationTokenMissingPermissions);
    });

    it("should throw IntegrationTokenExpired for expired token", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new IntegrationTokenExpired(),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(IntegrationTokenExpired);
    });

    it("should throw IntegrationTokenRetrievalFailed when token retrieval fails", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new IntegrationTokenRetrievalFailed(),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(IntegrationTokenRetrievalFailed);
    });

    it("should throw InternalError for server errors", async () => {
      const orgId = "test-org-id";
      const integrationId = "test-integration-id";

      githubReposService.getGithubRepositories.mockRejectedValue(
        new InternalError("TEST_ERROR", "Test error"),
      );

      await expect(
        controller.getRepositories(mockAuthenticatedUser, orgId, integrationId),
      ).rejects.toThrow(InternalError);
    });
  });
});
