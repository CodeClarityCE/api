import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { EntityNotFound, NotAuthorized } from "../../types/error.types";
import {
  PasswordsDoNotMatch,
  AccountRegistrationVerificationTokenInvalidOrExpired,
} from "../auth/auth.errors";
import { AuthenticatedUser, ROLE } from "../auth/auth.types";
import { CombinedAuthGuard } from "../auth/guards/combined.guard";
import type {
  UserCompleteSocialCreateBody,
  UserPasswordPatchBody,
  UserPatchBody,
  DefaultOrgPatchBody,
  DeleteAccountBody,
  ResendAccountRegEmailBody,
  RegistrationConfirmationBody,
} from "./user.types";
import { UsersController } from "./users.controller";
import type { User } from "./users.entity";
import {
  SetupAlreadyDone,
  FailedToSendAccountRegistrationVerificationEmail,
  CannotPerformActionOnNormalAccount,
  CannotPerformActionOnSocialAccount,
} from "./users.errors";
import { UsersService } from "./users.service";

describe("UsersController", () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  const mockUser = {
    id: "test-user-id",
    first_name: "Test",
    last_name: "User",
    email: "test@example.com",
    password: "hashedpassword",
    activated: true,
    setup_done: true,
    registration_verified: true,
    social: false,
    created_on: new Date(),
    updated_on: new Date(),
  } as unknown as User;

  const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  beforeEach(async () => {
    const mockUsersService = {
      getUser: jest.fn(),
      sendUserRegistrationVerificationEmail: jest.fn(),
      confirmRegistration: jest.fn(),
      delete: jest.fn(),
      completeSocialAccountSetup: jest.fn(),
      updatePassword: jest.fn(),
      updatePersonalInfo: jest.fn(),
      setDefaultOrg: jest.fn(),
    };

    const mockCombinedAuthGuard = {
      canActivate: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
    })
      .overrideGuard(CombinedAuthGuard)
      .useValue(mockCombinedAuthGuard)
      .compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  describe("get", () => {
    it("should return user data", async () => {
      usersService.getUser.mockResolvedValue(mockUser);

      const result = await controller.get(
        mockAuthenticatedUser,
        "test-user-id",
      );

      expect(usersService.getUser).toHaveBeenCalledWith(
        "test-user-id",
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ data: mockUser });
    });

    it("should throw EntityNotFound when user does not exist", async () => {
      usersService.getUser.mockRejectedValue(new EntityNotFound());

      await expect(
        controller.get(mockAuthenticatedUser, "nonexistent-id"),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw NotAuthorized when user lacks permission", async () => {
      usersService.getUser.mockRejectedValue(new NotAuthorized());

      await expect(
        controller.get(mockAuthenticatedUser, "other-user-id"),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("reSendAccountRegVerificationEmail", () => {
    it("should resend verification email successfully", async () => {
      const body: ResendAccountRegEmailBody = { email: "test@example.com" };

      usersService.sendUserRegistrationVerificationEmail.mockResolvedValue(
        undefined,
      );

      const result = await controller.reSendAccountRegVerificationEmail(body);

      expect(
        usersService.sendUserRegistrationVerificationEmail,
      ).toHaveBeenCalledWith(body.email);
      expect(result).toEqual({});
    });

    it("should throw error when email sending fails", async () => {
      const body: ResendAccountRegEmailBody = { email: "test@example.com" };

      usersService.sendUserRegistrationVerificationEmail.mockRejectedValue(
        new FailedToSendAccountRegistrationVerificationEmail(),
      );

      await expect(
        controller.reSendAccountRegVerificationEmail(body),
      ).rejects.toThrow(FailedToSendAccountRegistrationVerificationEmail);
    });
  });

  describe("confirmRegistration", () => {
    it("should confirm registration with valid token", async () => {
      const body: RegistrationConfirmationBody = {
        token: "valid-token",
        user_id_hash: "user-hash",
      };

      usersService.confirmRegistration.mockResolvedValue(undefined);

      const result = await controller.confirmRegistration(body);

      expect(usersService.confirmRegistration).toHaveBeenCalledWith(
        body.token,
        body.user_id_hash,
      );
      expect(result).toEqual({});
    });

    it("should throw error for invalid token", async () => {
      const body: RegistrationConfirmationBody = {
        token: "invalid-token",
        user_id_hash: "user-hash",
      };

      usersService.confirmRegistration.mockRejectedValue(
        new AccountRegistrationVerificationTokenInvalidOrExpired(),
      );

      await expect(controller.confirmRegistration(body)).rejects.toThrow(
        AccountRegistrationVerificationTokenInvalidOrExpired,
      );
    });
  });

  describe("deleteAccount", () => {
    it("should delete account successfully", async () => {
      const body: DeleteAccountBody = { password: "password123" };

      usersService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteAccount(
        mockAuthenticatedUser,
        "test-user-id",
        body,
      );

      expect(usersService.delete).toHaveBeenCalledWith(
        "test-user-id",
        mockAuthenticatedUser,
        body.password,
      );
      expect(result).toEqual({});
    });

    it("should throw NotAuthorized when user lacks permission", async () => {
      const body: DeleteAccountBody = { password: "password123" };

      usersService.delete.mockRejectedValue(new NotAuthorized());

      await expect(
        controller.deleteAccount(mockAuthenticatedUser, "other-user-id", body),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("completeSocialAccountSetup", () => {
    it("should complete social account setup successfully", async () => {
      const setupData: UserCompleteSocialCreateBody = {
        first_name: "Test",
        last_name: "User",
        handle: "testuser",
      };

      usersService.completeSocialAccountSetup.mockResolvedValue(
        "completed-user-id",
      );

      const result = await controller.completeSocialAccountSetup(
        mockAuthenticatedUser,
        setupData,
      );

      expect(usersService.completeSocialAccountSetup).toHaveBeenCalledWith(
        setupData,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ id: "completed-user-id" });
    });

    it("should throw error for normal account", async () => {
      const setupData: UserCompleteSocialCreateBody = {
        first_name: "Test",
        last_name: "User",
        handle: "testuser",
      };

      usersService.completeSocialAccountSetup.mockRejectedValue(
        new CannotPerformActionOnNormalAccount(),
      );

      await expect(
        controller.completeSocialAccountSetup(mockAuthenticatedUser, setupData),
      ).rejects.toThrow(CannotPerformActionOnNormalAccount);
    });

    it("should throw error when setup already done", async () => {
      const setupData: UserCompleteSocialCreateBody = {
        first_name: "Test",
        last_name: "User",
        handle: "testuser",
      };

      usersService.completeSocialAccountSetup.mockRejectedValue(
        new SetupAlreadyDone(),
      );

      await expect(
        controller.completeSocialAccountSetup(mockAuthenticatedUser, setupData),
      ).rejects.toThrow(SetupAlreadyDone);
    });
  });

  describe("updateAccountPassword", () => {
    it("should update password successfully", async () => {
      const patch: UserPasswordPatchBody = {
        old_password: "current123",
        password: "new123",
        password_confirmation: "new123",
      };

      usersService.updatePassword.mockResolvedValue(undefined);

      const result = await controller.updateAccountPassword(
        mockAuthenticatedUser,
        patch,
        "test-user-id",
      );

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        "test-user-id",
        patch,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });

    it("should throw error for social account", async () => {
      const patch: UserPasswordPatchBody = {
        old_password: "current123",
        password: "new123",
        password_confirmation: "new123",
      };

      usersService.updatePassword.mockRejectedValue(
        new CannotPerformActionOnSocialAccount(),
      );

      await expect(
        controller.updateAccountPassword(
          mockAuthenticatedUser,
          patch,
          "test-user-id",
        ),
      ).rejects.toThrow(CannotPerformActionOnSocialAccount);
    });

    it("should throw error for mismatched passwords", async () => {
      const patch: UserPasswordPatchBody = {
        old_password: "current123",
        password: "new123",
        password_confirmation: "different123",
      };

      usersService.updatePassword.mockRejectedValue(new PasswordsDoNotMatch());

      await expect(
        controller.updateAccountPassword(
          mockAuthenticatedUser,
          patch,
          "test-user-id",
        ),
      ).rejects.toThrow(PasswordsDoNotMatch);
    });
  });

  describe("updateAccountInfo", () => {
    it("should update personal info successfully", async () => {
      const patch: UserPatchBody = {
        first_name: "Updated",
        last_name: "Name",
      };

      usersService.updatePersonalInfo.mockResolvedValue(undefined);

      const result = await controller.updateAccountInfo(
        mockAuthenticatedUser,
        patch,
        "test-user-id",
      );

      expect(usersService.updatePersonalInfo).toHaveBeenCalledWith(
        "test-user-id",
        patch,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });

    it("should throw NotAuthorized when user lacks permission", async () => {
      const patch: UserPatchBody = {
        first_name: "Updated",
        last_name: "Name",
      };

      usersService.updatePersonalInfo.mockRejectedValue(new NotAuthorized());

      await expect(
        controller.updateAccountInfo(
          mockAuthenticatedUser,
          patch,
          "other-user-id",
        ),
      ).rejects.toThrow(NotAuthorized);
    });
  });

  describe("updateDefaultOrg", () => {
    it("should update default organization successfully", async () => {
      const patch: DefaultOrgPatchBody = {
        default_org: "org-id",
      };

      usersService.setDefaultOrg.mockResolvedValue(undefined);

      const result = await controller.updateDefaultOrg(
        mockAuthenticatedUser,
        patch,
        "test-user-id",
      );

      expect(usersService.setDefaultOrg).toHaveBeenCalledWith(
        "test-user-id",
        patch.default_org,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });

    it("should throw EntityNotFound when organization does not exist", async () => {
      const patch: DefaultOrgPatchBody = {
        default_org: "nonexistent-org",
      };

      usersService.setDefaultOrg.mockRejectedValue(new EntityNotFound());

      await expect(
        controller.updateDefaultOrg(
          mockAuthenticatedUser,
          patch,
          "test-user-id",
        ),
      ).rejects.toThrow(EntityNotFound);
    });
  });
});
