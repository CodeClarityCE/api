import { Test, type TestingModule } from "@nestjs/testing";

import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import { NotAuthorized } from "src/types/error.types";
import * as crypto from "src/utils/crypto";

import {
  AccountRegistrationVerificationTokenInvalidOrExpired,
  PasswordsDoNotMatch,
} from "../auth/auth.errors";
import { AuthService } from "../auth/auth.service";
import { AuthenticatedUser, ROLE } from "../auth/auth.types";
import { type Email, EmailType } from "../email/email.entity";
import { EmailRepository } from "../email/email.repository";
import { EmailService } from "../email/email.service";
import {
  MemberRole,
  type OrganizationMemberships,
} from "../organizations/memberships/organization.memberships.entity";
import type { Organization } from "../organizations/organization.entity";

import type {
  UserCreateBody,
  UserPasswordPatchBody,
  UserPatchBody,
} from "./user.types";
import type { User } from "./users.entity";
import {
  CannotPerformActionOnSocialAccount,
  FailedToSendAccountRegistrationVerificationEmail,
} from "./users.errors";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  let service: UsersService;
  let emailService: EmailService;
  let authService: AuthService;
  let organizationsRepository: OrganizationsRepository;
  let membershipsRepository: MembershipsRepository;
  let emailRepository: EmailRepository;
  let usersRepository: UsersRepository;

  const mockUser = {
    id: "test-user-id",
    first_name: "Test",
    last_name: "User",
    handle: "testuser",
    email: "test@example.com",
    password: "hashedpassword",
    activated: true,
    setup_done: true,
    registration_verified: true,
    social: false,
    social_register_type: undefined,
    avatar_url: undefined,
    created_on: new Date(),
    oauth_integration: undefined,
    social_id: undefined,
    default_org: undefined,
    admin: false,
    organizations_created: [],
    policies: [],
    analyzers_created: [],
    invitations: [],
    projects: [],
    analyses: [],
    files: [],
    emails: [],
    apiKeys: [],
    organizationMemberships: [],
    integrations: [],
    ownerships: [],
    projects_imported: [],
    integrations_owned: [],
    files_imported: [],
    mails: [],
  } as unknown as User;

  const mockOrganization = {
    id: "test-org-id",
    name: "Test Organization",
    description: "Test Organization Description",
    created_on: new Date(),
    personal: false,
    color_scheme: "1",
    created_by: mockUser,
    owners: [mockUser],
    default: [],
    organizationMemberships: [],
    projects: [],
    analyzers: [],
    analyses: [],
    logs: [],
    integrations: [],
    policies: [],
    invitations: [],
    notifications: [],
  } as unknown as Organization;

  const mockAuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  const mockUserCreateBody: UserCreateBody = {
    first_name: "Test",
    last_name: "User",
    handle: "testuser",
    email: "test@example.com",
    password: "password123",
    password_confirmation: "password123",
  };

  const mockUserPasswordPatchBody: UserPasswordPatchBody = {
    old_password: "oldpassword",
    password: "newpassword123",
    password_confirmation: "newpassword123",
  };

  const mockUserPatchBody: UserPatchBody = {
    first_name: "Updated",
    last_name: "Name",
  };

  const mockEmail = {
    id: "test-email-id",
    email_type: EmailType.USERS_REGISTRATION_VERIFICATION,
    token_digest: "token-digest",
    user_id_digest: "user-id-digest",
    ttl: new Date(Date.now() + 30 * 60000),
    user: mockUser,
  } as Email;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: EmailService,
          useValue: {
            sendRegistrationConfirmation: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            hashPassword: jest.fn(),
            validateCredentials: jest.fn(),
          },
        },
        {
          provide: OrganizationsRepository,
          useValue: {
            getOrganizationById: jest.fn(),
            saveOrganization: jest.fn(),
            saveMembership: jest.fn(),
          },
        },
        {
          provide: MembershipsRepository,
          useValue: {
            hasRequiredRole: jest.fn(),
            removeUserMemberships: jest.fn().mockResolvedValue(undefined),
            saveMembership: jest
              .fn()
              .mockResolvedValue({} as OrganizationMemberships),
          },
        },
        {
          provide: ProjectsRepository,
          useValue: {
            deleteUserProjects: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EmailRepository,
          useValue: {
            getMailByType: jest.fn(),
            saveMail: jest.fn(),
            getActivationMail: jest.fn(),
            removeMail: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            getUserById: jest.fn(),
            getUserByEmail: jest.fn(),
            saveUser: jest.fn(),
            deleteUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    emailService = module.get<EmailService>(EmailService);
    authService = module.get<AuthService>(AuthService);
    organizationsRepository = module.get<OrganizationsRepository>(
      OrganizationsRepository,
    );
    membershipsRepository = module.get<MembershipsRepository>(
      MembershipsRepository,
    );
    emailRepository = module.get<EmailRepository>(EmailRepository);
    usersRepository = module.get<UsersRepository>(UsersRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getUser", () => {
    it("should return user when userId matches authenticated user", async () => {
      jest.spyOn(usersRepository, "getUserById").mockResolvedValue(mockUser);

      const result = await service.getUser(
        "test-user-id",
        mockAuthenticatedUser,
      );

      expect(result).toBe(mockUser);
      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
    });

    it("should throw NotAuthorized when userId does not match authenticated user", async () => {
      await expect(
        service.getUser("different-user-id", mockAuthenticatedUser),
      ).rejects.toThrow(NotAuthorized);

      expect(usersRepository.getUserById).not.toHaveBeenCalled();
    });
  });

  describe("setDefaultOrg", () => {
    it("should set default organization successfully", async () => {
      const orgWithDefault = { ...mockOrganization, default: [] };
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockResolvedValue(undefined);
      jest.spyOn(usersRepository, "getUserById").mockResolvedValue(mockUser);
      jest
        .spyOn(organizationsRepository, "getOrganizationById")
        .mockResolvedValue(orgWithDefault);
      jest
        .spyOn(organizationsRepository, "saveOrganization")
        .mockResolvedValue(orgWithDefault);

      await service.setDefaultOrg(
        "test-user-id",
        "test-org-id",
        mockAuthenticatedUser,
      );

      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        "test-org-id",
        "test-user-id",
        MemberRole.USER,
      );
      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
      expect(organizationsRepository.getOrganizationById).toHaveBeenCalledWith(
        "test-org-id",
        {
          created_by: true,
          default: true,
        },
      );
      expect(orgWithDefault.default).toContain(mockUser);
      expect(organizationsRepository.saveOrganization).toHaveBeenCalledWith(
        orgWithDefault,
      );
    });

    it("should throw when user does not have required role", async () => {
      jest
        .spyOn(membershipsRepository, "hasRequiredRole")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.setDefaultOrg(
          "test-user-id",
          "test-org-id",
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("register", () => {
    it("should register user successfully", async () => {
      const hashedPassword = "hashed-password";
      const createdOrg = { ...mockOrganization, id: "new-org-id" };

      jest.spyOn(authService, "hashPassword").mockResolvedValue(hashedPassword);
      jest
        .spyOn(organizationsRepository, "saveOrganization")
        .mockResolvedValueOnce(createdOrg)
        .mockResolvedValueOnce(createdOrg);

      // Mock the saveUser method to return a user with an ID
      jest
        .spyOn(usersRepository, "saveUser")
        .mockImplementation((user: any) => {
          user.id = "new-user-id";
          return Promise.resolve(user);
        });

      jest
        .spyOn(membershipsRepository, "saveMembership")
        .mockResolvedValue({} as OrganizationMemberships);
      jest
        .spyOn(service, "sendUserRegistrationVerificationEmail")
        .mockResolvedValue(undefined);

      const result = await service.register(mockUserCreateBody);

      expect(result).toBe("new-user-id");
      expect(authService.hashPassword).toHaveBeenCalledWith("password123");
      expect(organizationsRepository.saveOrganization).toHaveBeenCalledTimes(2);
      expect(usersRepository.saveUser).toHaveBeenCalled();
      expect(membershipsRepository.saveMembership).toHaveBeenCalled();
      expect(
        service.sendUserRegistrationVerificationEmail,
      ).toHaveBeenCalledWith("test@example.com");
    });

    it("should throw PasswordsDoNotMatch when passwords do not match", async () => {
      const invalidUserData = {
        ...mockUserCreateBody,
        password_confirmation: "different-password",
      };

      await expect(service.register(invalidUserData)).rejects.toThrow(
        PasswordsDoNotMatch,
      );
    });

    it("should continue registration even if email sending fails", async () => {
      const hashedPassword = "hashed-password";
      const createdOrg = { ...mockOrganization, id: "new-org-id" };

      jest.spyOn(authService, "hashPassword").mockResolvedValue(hashedPassword);
      jest
        .spyOn(organizationsRepository, "saveOrganization")
        .mockResolvedValueOnce(createdOrg)
        .mockResolvedValueOnce(createdOrg);

      // Mock the saveUser method to return a user with an ID
      jest
        .spyOn(usersRepository, "saveUser")
        .mockImplementation((user: any) => {
          user.id = "new-user-id";
          return Promise.resolve(user);
        });

      jest
        .spyOn(membershipsRepository, "saveMembership")
        .mockResolvedValue({} as OrganizationMemberships);
      jest
        .spyOn(service, "sendUserRegistrationVerificationEmail")
        .mockRejectedValue(new Error("Email failed"));

      const result = await service.register(mockUserCreateBody);

      expect(result).toBe("new-user-id");
    });
  });

  describe("sendUserRegistrationVerificationEmail", () => {
    beforeEach(() => {
      jest.spyOn(crypto, "genRandomString").mockResolvedValue("random-token");
      jest.spyOn(crypto, "hash").mockResolvedValue("hashed-value");
    });

    it("should send registration verification email when user not verified", async () => {
      const unverifiedUser = { ...mockUser, registration_verified: false };
      jest
        .spyOn(usersRepository, "getUserByEmail")
        .mockResolvedValue(unverifiedUser);
      jest.spyOn(emailRepository, "getMailByType").mockResolvedValue(null);
      jest.spyOn(emailRepository, "saveMail").mockResolvedValue(undefined);
      jest
        .spyOn(emailService, "sendRegistrationConfirmation")
        .mockResolvedValue(undefined);

      await service.sendUserRegistrationVerificationEmail("test@example.com");

      expect(usersRepository.getUserByEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(emailRepository.getMailByType).toHaveBeenCalledWith(
        EmailType.USERS_REGISTRATION_VERIFICATION,
        unverifiedUser.id,
      );
      expect(emailRepository.saveMail).toHaveBeenCalled();
      expect(emailService.sendRegistrationConfirmation).toHaveBeenCalled();
    });

    it("should return early if user is already verified", async () => {
      const verifiedUser = { ...mockUser, registration_verified: true };
      jest
        .spyOn(usersRepository, "getUserByEmail")
        .mockResolvedValue(verifiedUser);

      await service.sendUserRegistrationVerificationEmail("test@example.com");

      expect(usersRepository.getUserByEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(emailRepository.getMailByType).not.toHaveBeenCalled();
      expect(emailService.sendRegistrationConfirmation).not.toHaveBeenCalled();
    });

    it("should update existing mail when mail already exists", async () => {
      const unverifiedUser = { ...mockUser, registration_verified: false };
      jest
        .spyOn(usersRepository, "getUserByEmail")
        .mockResolvedValue(unverifiedUser);
      jest.spyOn(emailRepository, "getMailByType").mockResolvedValue(mockEmail);
      jest.spyOn(emailRepository, "saveMail").mockResolvedValue(undefined);
      jest
        .spyOn(emailService, "sendRegistrationConfirmation")
        .mockResolvedValue(undefined);

      await service.sendUserRegistrationVerificationEmail("test@example.com");

      expect(emailRepository.saveMail).toHaveBeenCalledWith(mockEmail);
      expect(emailService.sendRegistrationConfirmation).toHaveBeenCalled();
    });

    it("should throw FailedToSendAccountRegistrationVerificationEmail when email sending fails", async () => {
      const unverifiedUser = { ...mockUser, registration_verified: false };
      jest
        .spyOn(usersRepository, "getUserByEmail")
        .mockResolvedValue(unverifiedUser);
      jest.spyOn(emailRepository, "getMailByType").mockResolvedValue(null);
      jest.spyOn(emailRepository, "saveMail").mockResolvedValue(undefined);
      jest
        .spyOn(emailService, "sendRegistrationConfirmation")
        .mockRejectedValue(new Error("Email failed"));

      await expect(
        service.sendUserRegistrationVerificationEmail("test@example.com"),
      ).rejects.toThrow(FailedToSendAccountRegistrationVerificationEmail);
    });
  });

  describe("confirmRegistration", () => {
    beforeEach(() => {
      jest.spyOn(crypto, "hash").mockResolvedValue("hashed-token");
    });

    it("should confirm registration successfully", async () => {
      const mailWithUser = {
        ...mockEmail,
        user: { ...mockUser, activated: false, registration_verified: false },
      };
      jest
        .spyOn(emailRepository, "getActivationMail")
        .mockResolvedValue(mailWithUser);
      jest
        .spyOn(usersRepository, "saveUser")
        .mockResolvedValue(mailWithUser.user);
      jest.spyOn(emailRepository, "removeMail").mockResolvedValue(undefined);

      await service.confirmRegistration("token", "userIdHash");

      expect(crypto.hash).toHaveBeenCalledWith("token", {});
      expect(emailRepository.getActivationMail).toHaveBeenCalledWith(
        "hashed-token",
        "userIdHash",
      );
      expect(mailWithUser.user.activated).toBe(true);
      expect(mailWithUser.user.registration_verified).toBe(true);
      expect(usersRepository.saveUser).toHaveBeenCalledWith(mailWithUser.user);
      expect(emailRepository.removeMail).toHaveBeenCalledWith(mailWithUser);
    });

    it("should throw AccountRegistrationVerificationTokenInvalidOrExpired when mail not found", async () => {
      jest
        .spyOn(emailRepository, "getActivationMail")
        .mockResolvedValue(null as any);

      await expect(
        service.confirmRegistration("token", "userIdHash"),
      ).rejects.toThrow(AccountRegistrationVerificationTokenInvalidOrExpired);
    });
  });

  describe("requestPasswordReset", () => {
    it("should throw not implemented error", async () => {
      await expect(
        service.requestPasswordReset("test@example.com"),
      ).rejects.toThrow("Method not implemented.");
    });
  });

  describe("resetPassword", () => {
    it("should throw not implemented error", async () => {
      await expect(
        service.resetPassword(
          "token",
          "userIdHash",
          "newPassword",
          "newPasswordConfirmation",
        ),
      ).rejects.toThrow("Method not implemented.");
    });
  });

  describe("registerSocial", () => {
    it("should throw not implemented error", async () => {
      await expect(
        service.registerSocial(
          "test@example.com",
          "accessToken",
          "GITHUB" as any,
          "socialId",
        ),
      ).rejects.toThrow("Method not implemented.");
    });
  });

  describe("completeSocialAccountSetup", () => {
    it("should throw not implemented error", async () => {
      await expect(
        service.completeSocialAccountSetup({} as any, mockAuthenticatedUser),
      ).rejects.toThrow("Method not implemented.");
    });
  });

  describe("updatePassword", () => {
    it("should update password successfully", async () => {
      const userWithOldPassword = { ...mockUser, social: false };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userWithOldPassword);
      jest
        .spyOn(authService, "validateCredentials")
        .mockResolvedValue([true, userWithOldPassword]);
      jest
        .spyOn(authService, "hashPassword")
        .mockResolvedValue("new-hashed-password");
      jest
        .spyOn(usersRepository, "saveUser")
        .mockResolvedValue(userWithOldPassword);

      await service.updatePassword(
        "test-user-id",
        mockUserPasswordPatchBody,
        mockAuthenticatedUser,
      );

      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
      expect(authService.validateCredentials).toHaveBeenCalledWith(
        "test@example.com",
        "oldpassword",
      );
      expect(authService.hashPassword).toHaveBeenCalledWith("newpassword123");
      expect(userWithOldPassword.password).toBe("new-hashed-password");
      expect(usersRepository.saveUser).toHaveBeenCalledWith(
        userWithOldPassword,
      );
    });

    it("should throw NotAuthorized when userId does not match authenticated user", async () => {
      await expect(
        service.updatePassword(
          "different-user-id",
          mockUserPasswordPatchBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw PasswordsDoNotMatch when passwords do not match", async () => {
      const invalidPasswordData = {
        ...mockUserPasswordPatchBody,
        password_confirmation: "different-password",
      };

      await expect(
        service.updatePassword(
          "test-user-id",
          invalidPasswordData,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(PasswordsDoNotMatch);
    });

    it("should throw CannotPerformActionOnSocialAccount when user is social", async () => {
      const socialUser = { ...mockUser, social: true };
      jest.spyOn(usersRepository, "getUserById").mockResolvedValue(socialUser);

      await expect(
        service.updatePassword(
          "test-user-id",
          mockUserPasswordPatchBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(CannotPerformActionOnSocialAccount);
    });

    it("should throw error when old password is incorrect", async () => {
      const userWithOldPassword = { ...mockUser, social: false };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userWithOldPassword);
      jest
        .spyOn(authService, "validateCredentials")
        .mockResolvedValue([false, userWithOldPassword]);

      await expect(
        service.updatePassword(
          "test-user-id",
          mockUserPasswordPatchBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow("Old password not correct");
    });
  });

  describe("updatePersonalInfo", () => {
    it("should update personal info successfully", async () => {
      const userToUpdate = { ...mockUser };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userToUpdate);
      jest.spyOn(usersRepository, "saveUser").mockResolvedValue(userToUpdate);

      await service.updatePersonalInfo(
        "test-user-id",
        mockUserPatchBody,
        mockAuthenticatedUser,
      );

      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
      expect(userToUpdate.first_name).toBe("Updated");
      expect(userToUpdate.last_name).toBe("Name");
      expect(usersRepository.saveUser).toHaveBeenCalledWith(userToUpdate);
    });

    it("should throw NotAuthorized when userId does not match authenticated user", async () => {
      await expect(
        service.updatePersonalInfo(
          "different-user-id",
          mockUserPatchBody,
          mockAuthenticatedUser,
        ),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should only update provided fields", async () => {
      const userToUpdate = { ...mockUser };
      const partialPatchBody = { first_name: "UpdatedOnly" };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userToUpdate);
      jest.spyOn(usersRepository, "saveUser").mockResolvedValue(userToUpdate);

      await service.updatePersonalInfo(
        "test-user-id",
        partialPatchBody,
        mockAuthenticatedUser,
      );

      expect(userToUpdate.first_name).toBe("UpdatedOnly");
      expect(userToUpdate.last_name).toBe("User"); // unchanged
    });
  });

  describe("delete", () => {
    it("should delete user successfully with correct password", async () => {
      const userToDelete = { ...mockUser, social: false };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userToDelete);
      jest
        .spyOn(authService, "validateCredentials")
        .mockResolvedValue([true, userToDelete]);
      jest.spyOn(usersRepository, "deleteUser").mockResolvedValue(undefined);

      await service.delete(
        "test-user-id",
        mockAuthenticatedUser,
        "correct-password",
      );

      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
      expect(authService.validateCredentials).toHaveBeenCalledWith(
        "test@example.com",
        "correct-password",
      );
      expect(usersRepository.deleteUser).toHaveBeenCalledWith("test-user-id");
    });

    it("should delete social user without password", async () => {
      const socialUser = { ...mockUser, social: true };
      jest.spyOn(usersRepository, "getUserById").mockResolvedValue(socialUser);
      jest.spyOn(usersRepository, "deleteUser").mockResolvedValue(undefined);

      await service.delete("test-user-id", mockAuthenticatedUser);

      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
      expect(authService.validateCredentials).not.toHaveBeenCalled();
      expect(usersRepository.deleteUser).toHaveBeenCalledWith("test-user-id");
    });

    it("should handle @self userId", async () => {
      const userToDelete = { ...mockUser, social: false };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userToDelete);
      jest
        .spyOn(authService, "validateCredentials")
        .mockResolvedValue([true, userToDelete]);
      jest.spyOn(usersRepository, "deleteUser").mockResolvedValue(undefined);

      await service.delete("@self", mockAuthenticatedUser, "correct-password");

      expect(usersRepository.getUserById).toHaveBeenCalledWith("test-user-id");
      expect(usersRepository.deleteUser).toHaveBeenCalledWith("test-user-id");
    });

    it("should throw NotAuthorized when userId does not match authenticated user", async () => {
      await expect(
        service.delete("different-user-id", mockAuthenticatedUser, "password"),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw NotAuthorized when password is missing for non-social user", async () => {
      const userToDelete = { ...mockUser, social: false };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userToDelete);

      await expect(
        service.delete("test-user-id", mockAuthenticatedUser),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should throw NotAuthorized when password is incorrect", async () => {
      const userToDelete = { ...mockUser, social: false };
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(userToDelete);
      jest
        .spyOn(authService, "validateCredentials")
        .mockResolvedValue([false, userToDelete]);

      await expect(
        service.delete("test-user-id", mockAuthenticatedUser, "wrong-password"),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("existsUser", () => {
    it("should throw not implemented error", async () => {
      await expect(service.existsUser("test-user-id")).rejects.toThrow(
        "Method not implemented.",
      );
    });
  });

  describe("existsSocialUser", () => {
    it("should throw not implemented error", async () => {
      await expect(
        service.existsSocialUser("socialId", "GITHUB" as any),
      ).rejects.toThrow("Method not implemented.");
    });
  });

  describe("existsUserEmail", () => {
    it("should throw not implemented error", async () => {
      await expect(service.existsUserEmail("test@example.com")).rejects.toThrow(
        "Method not implemented.",
      );
    });
  });
});
