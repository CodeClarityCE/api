import { Inject, Injectable } from "@nestjs/common";

import {
  AuthenticatedUser,
  type SignInTokens,
} from "src/base_modules/auth/auth.types";
import { Email, EmailType } from "src/base_modules/email/email.entity";
import {
  MemberRole,
  OrganizationMemberships,
} from "src/base_modules/organizations/memberships/organization.memberships.entity";
import { Organization } from "src/base_modules/organizations/organization.entity";
import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import {
  UserCreateBody,
  UserPasswordPatchBody,
  UserPatchBody,
} from "src/base_modules/users/user.types";
import { User } from "src/base_modules/users/users.entity";
import { CodeClarityLogger } from "src/services/logger.service";
import {
  EmailAlreadyExists,
  NotAuthorized,
  UserDoesNotExist,
} from "src/types/error.types";
import { genRandomString, hash } from "src/utils/crypto";

import {
  AccountRegistrationVerificationTokenInvalidOrExpired,
  HandleAlreadyExists,
  IncorrectCurrentPassword,
  PasswordResetTokenInvalidOrExpired,
  PasswordsDoNotMatch,
} from "../auth/auth.errors";
import type { AuthService } from "../auth/auth.service";
import { AUTH_SERVICE } from "../auth/auth.tokens";
import { EmailRepository } from "../email/email.repository";
import { EmailService } from "../email/email.service";

import { passwordResetExpiry } from "./password-reset.lifetime";
import {
  CannotPerformActionOnSocialAccount,
  FailedToSendAccountRegistrationVerificationEmail,
} from "./users.errors";

/**
 * This service offers methods for working with users
 */
@Injectable()
export class UsersService {
  private readonly logger = CodeClarityLogger.forService("UsersService");

  constructor(
    private readonly emailService: EmailService,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly emailRepository: EmailRepository,
    @Inject(AUTH_SERVICE)
    private readonly authService: AuthService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Return the user with the given id.
   * @throws {EntityNotFound} in case no user with the given userId could be found
   * @throws {NotAuthorized} in case the requesting user does not have permission to view the requested user
   *
   * @param userId userId
   * @returns the user
   */
  async getUser(
    userId: string,
    authenticatedUser: AuthenticatedUser,
  ): Promise<User> {
    if (userId !== authenticatedUser.userId) {
      throw new NotAuthorized();
    }

    return await this.usersRepository.getUserById(userId);
  }

  /**
   * Changes the default organization of the user
   * @throws {EntityNotFound} If the org could not be found
   * @throws {NotAuthorized} If the user is not a member of the org or if the user
   * making the request is not the same as the user that is to be changed
   *
   * @param userId The id of the user
   * @param orgId The id of the organization which is to be set as the default of the user
   * @param authenticatedUser The authenticated user
   */
  async setDefaultOrg(
    userId: string,
    orgId: string,
    authenticatedUser: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      authenticatedUser.userId,
      MemberRole.USER,
    );

    const user = await this.usersRepository.getUserById(userId);

    const organization = await this.organizationsRepository.getOrganizationById(
      orgId,
      {
        created_by: true,
        default: true,
      },
    );

    // if (user.id !== organization.created_by?.id) {
    //     throw new NotAuthorized('The user is not the owner of the organization');
    // }

    organization.default.push(user);

    await this.organizationsRepository.saveOrganization(organization);
  }

  /**
   * Register a user
   * @throws {PasswordsDoNotMatch} In case the passwords do not match.
   * @throws {EmailAlreadyExists} In case a user with the same email already exists.
   * @throws {HandleAlreadyExists} In case a user with the same handle already exists.
   *
   * @param userData The user register data
   * @returns the id of the created user
   */
  async register(userData: UserCreateBody): Promise<string> {
    if (userData.password !== userData.password_confirmation) {
      throw new PasswordsDoNotMatch();
    }

    if (await this.usersRepository.userExistsByEmail(userData.email)) {
      throw new EmailAlreadyExists();
    }
    if (await this.usersRepository.userExistsByHandle(userData.handle)) {
      throw new HandleAlreadyExists();
    }

    const passwordHash = await this.authService.hashPassword(userData.password);

    const organization = new Organization();
    organization.name = `${userData.handle}'s Org`;
    organization.description = `${userData.last_name} ${userData.first_name}'s Personal Organization`;
    organization.created_on = new Date();
    organization.personal = true;
    organization.color_scheme = "1";

    const org_created =
      await this.organizationsRepository.saveOrganization(organization);

    const user = new User();
    user.first_name = userData.first_name;
    user.last_name = userData.last_name;
    user.email = userData.email;
    user.handle = userData.handle;
    user.password = passwordHash;
    user.social = false;
    user.setup_done = true;
    user.activated = false;
    user.registration_verified = false;
    // avatar_url is already undefined by default
    user.created_on = new Date();
    user.default_org = organization;

    const user_created = await this.usersRepository.saveUser(user);

    org_created.created_by = user_created;
    org_created.owners = [user_created];

    await this.organizationsRepository.saveOrganization(org_created);

    const orgMember = new OrganizationMemberships();
    orgMember.organization = org_created;
    orgMember.user = user_created;
    orgMember.role = 0;
    orgMember.joined_on = new Date();

    await this.membershipsRepository.saveMembership(orgMember);

    try {
      await this.sendUserRegistrationVerificationEmail(userData.email);
    } catch (_err) {
      // The user can resend the user registration verification email, so no need to throw here
    }

    return user.id;
  }

  /**
   * Sends a user registration verification email
   * @throws {FailedToSendAccountRegistrationVerificationEmail} If the email with the registration verification failed to be sent
   *
   * @param email The email address to which to send the email to
   */
  async sendUserRegistrationVerificationEmail(email: string): Promise<void> {
    const user = await this.usersRepository.getUserByEmail(email);

    // If the user's registration is already verified simply return
    if (user.registration_verified === true) {
      return;
    }

    // Find one registration action where EmailActionType.USERS_REGISTRATION_VERIFICATION, and user id
    const mail = await this.emailRepository.getMailByType(
      EmailType.USERS_REGISTRATION_VERIFICATION,
      user.id,
    );

    const activationToken = await genRandomString(64);
    const activationTokenhash = await hash(activationToken, {});
    const userIdHash = await hash(user.id, {});

    if (!mail) {
      const mail = new Email();
      mail.email_type = EmailType.USERS_REGISTRATION_VERIFICATION;
      mail.token_digest = activationTokenhash;
      mail.user_id_digest = userIdHash;
      mail.ttl = new Date(new Date().getTime() + 30 * 60000); // Expires after 30 mins
      mail.user = user;

      await this.emailRepository.saveMail(mail);
    } else {
      mail.ttl = new Date(new Date().getTime() + 30 * 60000); // Expires after 30 mins
      mail.token_digest = activationTokenhash;
      await this.emailRepository.saveMail(mail);
    }

    try {
      // attempt send the email
      await this.emailService.sendRegistrationConfirmation({
        email: user.email,
        token: activationToken,
        userIdDigest: userIdHash,
      });
    } catch (err) {
      throw new FailedToSendAccountRegistrationVerificationEmail(err);
    }
  }

  /**
   * Confirms a registration and unlocks a user's account
   * @throws {AccountRegistrationVerificationTokenInvalidOrExpired} In case the token does not exist or has expired.
   *
   * @param token The token provided via email
   * @param userIdHash The user id hash provided via email
   */
  async confirmRegistration(token: string, userIdHash: string): Promise<void> {
    const activationTokenhash = await hash(token, {});
    const mail = await this.emailRepository.findRegistrationMail(
      activationTokenhash,
      userIdHash,
    );

    if (!mail) {
      throw new AccountRegistrationVerificationTokenInvalidOrExpired();
    }

    mail.user.activated = true;
    mail.user.registration_verified = true;

    await this.usersRepository.saveUser(mail.user);
    await this.emailRepository.removeMail(mail);
  }

  /**
   * Emails a password reset link to a password-based account.
   * Answers the same whether or not the email has an account, and never throws for a failed send.
   *
   * @param email the email of the user
   */
  async requestPasswordReset(email: string): Promise<void> {
    let user: User;
    try {
      user = await this.usersRepository.getUserByEmail(email);
    } catch (err) {
      if (err instanceof UserDoesNotExist) return;
      throw err;
    }
    // Social accounts have no password to reset.
    if (user.social) return;

    const token = await genRandomString(64);
    const tokenDigest = await hash(token, {});
    const userIdDigest = await hash(user.id, {});

    // One reset email row per user: a new request replaces the earlier token.
    const mail =
      (await this.emailRepository.getMailByType(
        EmailType.USERS_PASSWORD_RESET,
        user.id,
      )) ?? new Email();
    mail.email_type = EmailType.USERS_PASSWORD_RESET;
    mail.token_digest = tokenDigest;
    mail.user_id_digest = userIdDigest;
    mail.ttl = passwordResetExpiry();
    mail.user = user;
    await this.emailRepository.saveMail(mail);

    // Not awaited, so the answer takes as long whether or not mail is sent.
    void this.emailService
      .sendPasswordReset({ email: user.email, token, userIdDigest })
      .catch((err: unknown) => {
        this.logger.error(
          "Failed to send password reset email",
          err instanceof Error ? err.message : String(err),
          { userId: user.id },
        );
      });
  }

  /**
   * Resets the password of a user via the link sent by email. The link works once.
   * @throws {PasswordsDoNotMatch} Passwords do not match.
   * @throws {PasswordResetTokenInvalidOrExpired} Password reset token does not exist or has expired.
   *
   * @param token The token provided via email
   * @param userIdHash The user id hash provided via email
   * @param newPassword The new password
   * @param newPasswordConfirmation Confirmation of the new password
   */
  async resetPassword(
    token: string,
    userIdHash: string,
    newPassword: string,
    newPasswordConfirmation: string,
  ): Promise<void> {
    if (newPassword !== newPasswordConfirmation) {
      throw new PasswordsDoNotMatch();
    }

    const tokenDigest = await hash(token, {});
    const mail = await this.emailRepository.findPasswordResetMail(
      tokenDigest,
      userIdHash,
    );
    // Deleting the row first makes the token single-use, even for concurrent requests.
    if (!mail || !(await this.emailRepository.consumeMail(mail.id))) {
      throw new PasswordResetTokenInvalidOrExpired();
    }

    mail.user.password = await this.authService.hashPassword(newPassword);
    // Sign-ins end first, so a failed save never leaves old ones working.
    await this.authService.signOutEverywhere(mail.user.id);
    await this.usersRepository.saveUser(mail.user);
  }

  /**
   * Update a user's password
   * @throws {EntityNotFound} If the user does not exist
   * @throws {NotAuthorized} If the user is not authorized to perform the action on the indicated userId
   * @throws {PasswordsDoNotMatch} If the provided password and passwordConfirmation do not match
   * @throws {IncorrectCurrentPassword} If the old password is wrong
   * @throws {CannotPerformActionOnSocialAccount} If the user tries to update a password on a social account
   *
   * @param userId The id of the user to update
   * @param passwordPatchBody The password update data
   * @param authenticatedUser The authenticated user
   * @returns a fresh sign-in for the caller; every other sign-in of the user ends
   */
  async updatePassword(
    userId: string,
    passwordPatchBody: UserPasswordPatchBody,
    authenticatedUser: AuthenticatedUser,
  ): Promise<SignInTokens> {
    if (userId !== authenticatedUser.userId) {
      throw new NotAuthorized();
    }

    if (
      passwordPatchBody.password !== passwordPatchBody.password_confirmation
    ) {
      throw new PasswordsDoNotMatch();
    }
    const user = await this.usersRepository.getUserById(
      authenticatedUser.userId,
    );

    if (user.social) {
      throw new CannotPerformActionOnSocialAccount();
    }

    const [match] = await this.authService.validateCredentials(
      user.email,
      passwordPatchBody.old_password,
    );
    if (!match) {
      throw new IncorrectCurrentPassword();
    }

    const newPasswordHash = await this.authService.hashPassword(
      passwordPatchBody.password,
    );

    user.password = newPasswordHash;

    // Sign-ins end first, so a failed save never leaves old ones working.
    await this.authService.signOutEverywhere(user.id);
    await this.usersRepository.saveUser(user);
    return this.authService.startSignIn(user);
  }

  /**
   * Update a user's password
   * @throws {EntityNotFound} If the user does not exist
   * @throws {NotAuthorized} If the user is not authorized to perform the action on the indicated userId
   *
   * @param userId The id of the user to update
   * @param userPatchBody The user update data
   * @param authenticatedUser The authenticated user
   */
  async updatePersonalInfo(
    userId: string,
    userPatchBody: UserPatchBody,
    authenticatedUser: AuthenticatedUser,
  ): Promise<void> {
    if (userId !== authenticatedUser.userId) {
      throw new NotAuthorized();
    }

    const user = await this.usersRepository.getUserById(
      authenticatedUser.userId,
    );

    if (userPatchBody.first_name) {
      user.first_name = userPatchBody.first_name;
    }

    if (userPatchBody.last_name) {
      user.last_name = userPatchBody.last_name;
    }

    await this.usersRepository.saveUser(user);
  }

  /**
   * Deletes a user
   * @throws {EntityNotFound} If the user does not exist
   * @throws {NotAuthorized} If the user is not authorized to perform the action on the indicated userId
   *
   * @param userId The id of the user to delete
   * @param authenticatedUser The authenticated user
   * @param password The password to confirm account deletion. This is not required for social accounts.
   */
  async delete(
    userId: string,
    authenticatedUser: AuthenticatedUser,
    password?: string,
  ): Promise<void> {
    if (userId === "@self") {
      userId = authenticatedUser.userId;
    }

    if (authenticatedUser.userId !== userId) {
      throw new NotAuthorized();
    }

    const user = await this.usersRepository.getUserById(userId);

    if (!user.social) {
      // Require password for non-social users
      if (!password) {
        throw new NotAuthorized();
      }

      const authorized = await this.authService.validateCredentials(
        user.email,
        password,
      );
      if (!authorized[0]) {
        throw new NotAuthorized();
      }
    }

    // Orchestrate cross-repository cleanup before deleting user
    await this.membershipsRepository.removeUserMemberships(user.id);
    await this.projectsRepository.deleteUserProjects(user.id);
    await this.usersRepository.deleteUser(user.id);
  }
}
