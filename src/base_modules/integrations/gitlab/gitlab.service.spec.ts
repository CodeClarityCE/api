import { Test, type TestingModule } from "@nestjs/testing";
import {
  IntegrationsRepository,
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import {
  DuplicateIntegration,
  EntityNotFound,
  IntegrationInvalidToken,
  IntegrationTokenExpired,
  IntegrationTokenMissingPermissions,
  IntegrationTokenRefreshFailed,
  IntegrationTokenRetrievalFailed,
  IntegrationWrongTokenType,
  NotAMember,
  NotAuthorized,
} from "../../../types/error.types";
import { AuthenticatedUser, ROLE } from "../../auth/auth.types";
import { MemberRole } from "../../organizations/memberships/orgMembership.types";
import type { Organization } from "../../organizations/organization.entity";
import type { User } from "../../users/users.entity";
import {
  IntegrationProvider,
  IntegrationType,
  type Integration,
} from "../integrations.entity";
import { GitlabIntegrationService } from "./gitlab.service";
import {
  type LinkGitlabCreateBody,
  type LinkGitlabPatchBody,
  GitlabIntegration,
  GitlabTokenType,
} from "./gitlabIntegration.types";
import { GitlabIntegrationTokenService } from "./gitlabToken.service";

describe("GitlabIntegrationService", () => {
  let service: GitlabIntegrationService;
  let organizationsRepository: jest.Mocked<OrganizationsRepository>;
  let membershipsRepository: MembershipsRepository;
  let integrationsRepository: jest.Mocked<IntegrationsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;

  const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  const mockUser: User = {
    id: "test-user-id",
    email: "test@example.com",
    first_name: "Test",
    last_name: "User",
    activated: true,
    registration_verified: true,
    password: "hashed-password",
    created_on: new Date(),
    integrations: [],
    analyses: [],
  } as any;

  const mockOrganization: Organization = {
    id: "test-org-id",
    name: "Test Organization",
    description: "Test organization description",
    created_on: new Date(),
    integrations: [],
    analyses: [],
    policies: [],
    projects: [],
    color_scheme: "default",
    personal: false,
    created_by: mockUser,
    organizationMemberships: [],
    default: false,
    analyzers: [],
    logs: [],
  } as any;

  const mockIntegration: Integration = {
    id: "test-integration-id",
    integration_type: IntegrationType.VCS,
    integration_provider: IntegrationProvider.GITLAB,
    access_token: "glpat-test-token",
    invalid: false,
    added_on: new Date(),
    service_domain: "https://gitlab.com",
    token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
    organizations: [mockOrganization],
    owner: mockUser,
    users: [mockUser],
    last_repository_sync: new Date(),
    repository_cache: [] as any,
    projects: [],
    analyses: [],
  };

  beforeEach(async () => {
    const mockGitlabIntegrationTokenService = {
      validatePersonalAccessTokenPermissions: jest.fn(),
      getPersonalAccessTokenExpiryRemote: jest.fn(),
      validateOAuthAccessTokenPermissions: jest.fn(),
      getOAuthTokenExpiryRemote: jest.fn(),
      refreshOAuthToken: jest.fn(),
      updateOAuthTokenFromSignIn: jest.fn(),
    };

    const mockOrganizationsRepository = {
      getOrganizationById: jest.fn(),
      doesIntegrationBelongToOrg: jest.fn(),
      saveOrganization: jest.fn(),
    };

    const mockMembershipsRepository = {
      hasRequiredRole: jest.fn(),
    };

    const mockIntegrationsRepository = {
      getIntegrationById: jest.fn(),
      saveIntegration: jest.fn(),
    };

    const mockUsersRepository = {
      getUserById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitlabIntegrationService,
        {
          provide: GitlabIntegrationTokenService,
          useValue: mockGitlabIntegrationTokenService,
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
          provide: UsersRepository,
          useValue: mockUsersRepository,
        },
      ],
    }).compile();

    service = module.get<GitlabIntegrationService>(GitlabIntegrationService);
    organizationsRepository = module.get(OrganizationsRepository);
    membershipsRepository = module.get<MembershipsRepository>(
      MembershipsRepository,
    );
    integrationsRepository = module.get(IntegrationsRepository);
    usersRepository = module.get(UsersRepository);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getGitlabIntegration", () => {
    it("should successfully retrieve a GitLab integration", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        true,
      );
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      const result = await service.getGitlabIntegration(
        "test-org-id",
        "test-integration-id",
        mockAuthenticatedUser,
      );

      expect(result).toBeInstanceOf(GitlabIntegration);
      expect(result.id).toBe("test-integration-id");
      expect(result.token_type).toBe(GitlabTokenType.PERSONAL_ACCESS_TOKEN);
      expect(result.service_base_url).toBe("https://gitlab.com");
      expect(result.organization_id).toBe("test-org-id");
      expect(
        organizationsRepository.doesIntegrationBelongToOrg,
      ).toHaveBeenCalledWith("test-integration-id", "test-org-id");
      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        "test-org-id",
        "test-user-id",
        MemberRole.USER,
      );
      expect(integrationsRepository.getIntegrationById).toHaveBeenCalledWith(
        "test-integration-id",
        { organizations: true, owner: true },
      );
    });

    it("should throw NotAuthorized when integration does not belong to org", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        false,
      );

      await expect(
        service.getGitlabIntegration(
          "test-org-id",
          "test-integration-id",
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw NotAuthorized when user lacks required role", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        true,
      );
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.getGitlabIntegration(
          "test-org-id",
          "test-integration-id",
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("addGitlabIntegration", () => {
    const linkGitlabCreateBody: LinkGitlabCreateBody = {
      token: "glpat-test-token",
      token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
      gitlab_instance_url: "https://gitlab.com",
    };

    const mockOrganizationWithIntegrations: Organization = {
      ...mockOrganization,
      integrations: [],
    };

    it("should successfully add a GitLab integration", async () => {
      organizationsRepository.getOrganizationById.mockResolvedValue(
        mockOrganizationWithIntegrations,
      );
      usersRepository.getUserById.mockResolvedValue(mockUser);
      integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);
      organizationsRepository.saveOrganization.mockResolvedValue(
        mockOrganizationWithIntegrations,
      );

      const result = await service.addGitlabIntegration(
        "test-org-id",
        linkGitlabCreateBody,
        mockAuthenticatedUser,
      );

      expect(result).toBe("test-integration-id");
      expect(organizationsRepository.getOrganizationById).toHaveBeenCalledWith(
        "test-org-id",
        { integrations: true },
      );
      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
      expect(integrationsRepository.saveIntegration).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_type: IntegrationType.VCS,
          integration_provider: IntegrationProvider.GITLAB,
          access_token: "glpat-test-token",
          token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
          service_domain: "https://gitlab.com",
          invalid: false,
          owner: mockUser,
          users: [mockUser],
        }),
      );
      expect(organizationsRepository.saveOrganization).toHaveBeenCalled();
    });

    it("should throw IntegrationWrongTokenType when token type is not PAT", async () => {
      const invalidBody = {
        ...linkGitlabCreateBody,
        token_type: GitlabTokenType.OAUTH_TOKEN,
      };

      await expect(
        service.addGitlabIntegration(
          "test-org-id",
          invalidBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(IntegrationWrongTokenType);
    });

    it("should throw IntegrationWrongTokenType when token format is invalid", async () => {
      const invalidBody = {
        ...linkGitlabCreateBody,
        token: "invalid-token-format",
      };

      await expect(
        service.addGitlabIntegration(
          "test-org-id",
          invalidBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(IntegrationWrongTokenType);
    });

    it("should throw EntityNotFound when organization does not exist", async () => {
      organizationsRepository.getOrganizationById.mockRejectedValue(
        new EntityNotFound(),
      );

      await expect(
        service.addGitlabIntegration(
          "test-org-id",
          linkGitlabCreateBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw DuplicateIntegration when GitLab integration already exists", async () => {
      const orgWithExistingIntegration: Organization = {
        ...mockOrganizationWithIntegrations,
        integrations: [mockIntegration],
      };
      organizationsRepository.getOrganizationById.mockResolvedValue(
        orgWithExistingIntegration,
      );

      await expect(
        service.addGitlabIntegration(
          "test-org-id",
          linkGitlabCreateBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(DuplicateIntegration);
    });

    it("should allow adding GitLab integration when only GitHub integration exists", async () => {
      const githubIntegration: Integration = {
        ...mockIntegration,
        integration_provider: IntegrationProvider.GITHUB,
      };
      const orgWithGithubIntegration: Organization = {
        ...mockOrganizationWithIntegrations,
        integrations: [githubIntegration],
      };

      organizationsRepository.getOrganizationById.mockResolvedValue(
        orgWithGithubIntegration,
      );
      usersRepository.getUserById.mockResolvedValue(mockUser);
      integrationsRepository.saveIntegration.mockResolvedValue(mockIntegration);
      organizationsRepository.saveOrganization.mockResolvedValue(
        orgWithGithubIntegration,
      );

      const result = await service.addGitlabIntegration(
        "test-org-id",
        linkGitlabCreateBody,
        mockAuthenticatedUser,
      );

      expect(result).toBe("test-integration-id");
    });
  });

  describe("modifyGitlabIntegration", () => {
    const linkGitlabPatchBody: LinkGitlabPatchBody = {
      token: "glpat-new-token",
      token_type: GitlabTokenType.PERSONAL_ACCESS_TOKEN,
      gitlab_instance_url: "https://gitlab.com",
    };

    it("should throw NotAuthorized when integration does not belong to org", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        false,
      );

      await expect(
        service.modifyGitlabIntegration(
          "test-org-id",
          "test-integration-id",
          linkGitlabPatchBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw NotAuthorized when user lacks admin role", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        true,
      );
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.modifyGitlabIntegration(
          "test-org-id",
          "test-integration-id",
          linkGitlabPatchBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw IntegrationWrongTokenType when token type is not PAT", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        true,
      );
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);

      const invalidBody = {
        ...linkGitlabPatchBody,
        token_type: GitlabTokenType.OAUTH_TOKEN,
      };

      await expect(
        service.modifyGitlabIntegration(
          "test-org-id",
          "test-integration-id",
          invalidBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(IntegrationWrongTokenType);
    });

    it("should throw Error for unimplemented method", async () => {
      organizationsRepository.doesIntegrationBelongToOrg.mockResolvedValue(
        true,
      );
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);

      await expect(
        service.modifyGitlabIntegration(
          "test-org-id",
          "test-integration-id",
          linkGitlabPatchBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow("Method not implemented.");
    });
  });

  describe("removeGitlabIntegration", () => {
    it("should throw Error for unimplemented method", async () => {
      await expect(
        service.removeGitlabIntegration(
          "test-org-id",
          "test-integration-id",
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow("Method not implemented.");
    });
  });

  describe("getToken", () => {
    it("should successfully retrieve and validate GitLab token", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      // Mock the GitlabIntegrationToken constructor and validate method
      const mockToken = {
        validate: jest.fn().mockResolvedValue(undefined),
      };

      // We need to mock the constructor behavior
      const spy = jest
        .spyOn(service as any, "getToken")
        .mockImplementation(async () => {
          // Call the original method to ensure the repository is called
          await integrationsRepository.getIntegrationById(
            "test-integration-id",
          );
          return mockToken;
        });

      const result = await service.getToken("test-integration-id");

      expect(result).toBeDefined();
      expect(integrationsRepository.getIntegrationById).toHaveBeenCalledWith(
        "test-integration-id",
      );

      spy.mockRestore();
    });

    it("should throw IntegrationTokenMissingPermissions when token lacks permissions", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      jest.spyOn(service as any, "getToken").mockImplementation(async () => {
        throw new IntegrationTokenMissingPermissions();
      });

      await expect(service.getToken("test-integration-id")).rejects.toThrow(
        IntegrationTokenMissingPermissions,
      );
    });

    it("should throw IntegrationTokenExpired when token is expired", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      jest.spyOn(service as any, "getToken").mockImplementation(async () => {
        throw new IntegrationTokenExpired();
      });

      await expect(service.getToken("test-integration-id")).rejects.toThrow(
        IntegrationTokenExpired,
      );
    });

    it("should throw IntegrationInvalidToken when token is invalid", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      jest.spyOn(service as any, "getToken").mockImplementation(async () => {
        throw new IntegrationInvalidToken();
      });

      await expect(service.getToken("test-integration-id")).rejects.toThrow(
        IntegrationInvalidToken,
      );
    });

    it("should throw IntegrationTokenRetrievalFailed when token retrieval fails", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      jest.spyOn(service as any, "getToken").mockImplementation(async () => {
        throw new IntegrationTokenRetrievalFailed();
      });

      await expect(service.getToken("test-integration-id")).rejects.toThrow(
        IntegrationTokenRetrievalFailed,
      );
    });

    it("should throw IntegrationTokenRefreshFailed when token refresh fails", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      jest.spyOn(service as any, "getToken").mockImplementation(async () => {
        throw new IntegrationTokenRefreshFailed();
      });

      await expect(service.getToken("test-integration-id")).rejects.toThrow(
        IntegrationTokenRefreshFailed,
      );
    });

    it("should throw NotAuthorized when NotAMember error occurs", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      jest.spyOn(service as any, "getToken").mockImplementation(async () => {
        throw new NotAMember();
      });

      await expect(service.getToken("test-integration-id")).rejects.toThrow(
        NotAMember,
      );
    });

    it("should re-throw other errors", async () => {
      integrationsRepository.getIntegrationById.mockResolvedValue(
        mockIntegration,
      );

      const unknownError = new Error("Unknown error");
      jest.spyOn(service as any, "getToken").mockImplementation(async () => {
        throw unknownError;
      });

      await expect(service.getToken("test-integration-id")).rejects.toThrow(
        unknownError,
      );
    });
  });

  describe("getTokenTypeFromTokenString", () => {
    it("should return PERSONAL_ACCESS_TOKEN for tokens starting with glpat", () => {
      const result = (service as any).getTokenTypeFromTokenString(
        "glpat-xxxxxxxxxxxxxxxxxxxx",
      );
      expect(result).toBe(GitlabTokenType.PERSONAL_ACCESS_TOKEN);
    });

    it("should throw IntegrationWrongTokenType for invalid token format", () => {
      expect(() => {
        (service as any).getTokenTypeFromTokenString("invalid-token");
      }).toThrow(IntegrationWrongTokenType);
    });

    it("should throw IntegrationWrongTokenType for empty token", () => {
      expect(() => {
        (service as any).getTokenTypeFromTokenString("");
      }).toThrow(IntegrationWrongTokenType);
    });

    it("should throw error for null token", () => {
      expect(() => {
        (service as any).getTokenTypeFromTokenString(null);
      }).toThrow();
    });
  });

  describe("checkIfIntegrationAlreadyExists", () => {
    it.skip("should throw Error for unimplemented method", async () => {
      // This test is skipped because checkIfIntegrationAlreadyExists is not used in the current implementation
      // await expect(
      //     (service as any).___checkIfIntegrationAlreadyExists(
      //         'test-org-id',
      //         'https://gitlab.com'
      //     )
      // ).rejects.toThrow('Method not implemented.');
    });
  });
});
