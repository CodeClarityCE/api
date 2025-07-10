import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { NotAuthorized } from 'src/types/error.types';
import {
    SocialType,
    UserCompleteSocialCreateBody,
    UserCreateBody,
    UserPasswordPatchBody,
    UserPatchBody
} from 'src/base_modules/users/user.types';
import { EmailService } from '../email/email.service';
import { genRandomString, hash } from 'src/utils/crypto';
import { AuthService } from '../auth/auth.service';
import { User } from 'src/base_modules/users/users.entity';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import {
    MemberRole,
    OrganizationMemberships
} from 'src/base_modules/organizations/memberships/organization.memberships.entity';
import { Email, EmailType } from 'src/base_modules/email/email.entity';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { EmailRepository } from '../email/email.repository';
import { UsersRepository } from './users.repository';
import {
    CannotPerformActionOnSocialAccount,
    FailedToSendAccountRegistrationVerificationEmail
} from './users.errors';
import {
    AccountRegistrationVerificationTokenInvalidOrExpired,
    PasswordsDoNotMatch
} from '../auth/auth.errors';

/**
 * This service offers methods for working with users
 */
@Injectable()
export class UsersService {
    constructor(
        private readonly emailService: EmailService,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly emailRepository: EmailRepository,
        @Inject(forwardRef(() => AuthService))
        private readonly authService: AuthService,
        private readonly usersRepository: UsersRepository
    ) {}

    /**
     * Return the user with the given id.
     * @throws {EntityNotFound} in case no user with the given userId could be found
     * @throws {NotAuthorized} in case the requesting user does not have permission to view the requested user
     *
     * @param userId userId
     * @returns the user
     */
    async getUser(userId: string, authenticatedUser: AuthenticatedUser): Promise<User> {
        if (userId != authenticatedUser.userId) {
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
        authenticatedUser: AuthenticatedUser
    ): Promise<void> {
        await this.organizationsRepository.hasRequiredRole(
            orgId,
            authenticatedUser.userId,
            MemberRole.USER
        );

        const user = await this.usersRepository.getUserById(userId);

        const organization = await this.organizationsRepository.getOrganizationById(orgId, {
            created_by: true,
            default: true
        });

        // if (user.id != organization.created_by?.id) {
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
        if (userData.password != userData.password_confirmation) {
            throw new PasswordsDoNotMatch();
        }

        const passwordHash = await this.authService.hashPassword(userData.password);

        const organization = new Organization();
        organization.name = `${userData.handle}'s Org`;
        organization.description = `${userData.last_name} ${userData.first_name}'s Personal Organization`;
        organization.created_on = new Date();
        organization.personal = true;
        organization.color_scheme = '1';

        const org_created = await this.organizationsRepository.saveOrganization(organization);

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
        user.avatar_url = undefined;
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

        await this.organizationsRepository.saveMembership(orgMember);

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
        if (user.registration_verified == true) {
            return;
        }

        // Find one registration action where EmailActionType.USERS_REGISTRATION_VERIFICATION, and user id
        const mail = await this.emailRepository.getMailByType(
            EmailType.USERS_REGISTRATION_VERIFICATION,
            user.id
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
                userIdDigest: userIdHash
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
        const mail = await this.emailRepository.getActivationMail(activationTokenhash, userIdHash);

        if (!mail) {
            throw new AccountRegistrationVerificationTokenInvalidOrExpired();
        }

        mail.user.activated = true;
        mail.user.registration_verified = true;

        await this.usersRepository.saveUser(mail.user);
        await this.emailRepository.removeMail(mail);
    }

    /**
     * Requests a password reset
     * @throws {FailedToSendPasswordResetEmail} If the email with the password reset failed to be sent
     *
     * @param email the email of the user
     */
    async requestPasswordReset(_email: string): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Resets the password of a user via the email reset link sent via email
     * @throws {PasswordsDoNotMatch} Passwords do not match.
     * @throws {PasswordResetTokenInvalidOrExpired} Password reset token does not exist or has expired.
     *
     * @param token The token provided via email
     * @param userIdHash The user id hash provided via email
     * @param newPassword The new password
     * @param newPasswordConfirmation Confirmation of the new password
     */
    async resetPassword(
        _token: string,
        _userIdHash: string,
        _newPassword: string,
        _newPasswordConfirmation: string
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Register a social connected account
     * @throws {SocialConnectionTypeNotSupported} The social connection type is not supported
     *
     * @param email The email of the user
     * @param accessToken The access token of the social connection
     * @param socialType The social type, e.g. Github, GitLab
     * @param socialId The id of the social account
     * @param avatarUrl An avatar of the user (optional)
     * @param refreshToken A refresh token
     * @param integrationBaseUrl The url under which to reach the social connection's api
     * @returns the id of the created user
     */
    async registerSocial(
        _email: string,
        _accessToken: string,
        _socialType: SocialType,
        _socialId: string,
        _avatarUrl?: string,
        _refreshToken?: string,
        _integrationBaseUrl?: string
    ): Promise<string> {
        throw new Error('Method not implemented.');
    }

    /**
     * Completes a user's social registration
     * @throws {EntityNotFound} If the user could not be found
     * @throws {CannotPerformActionOnNormalAccount} If the user tries to invoke this method on a non-social account
     * @throws {SetupAlreadyDone} If the setup is already done
     *
     * @param userCompleteSocial The data to complete the social account
     * @param authenticatedUser The authenticated user
     * @returns the user id
     */
    async completeSocialAccountSetup(
        _userCompleteSocial: UserCompleteSocialCreateBody,
        _authenticatedUser: AuthenticatedUser
    ): Promise<string> {
        throw new Error('Method not implemented.');
    }

    /**
     * Update a user's password
     * @throws {EntityNotFound} If the user does not exist
     * @throws {NotAuthorized} If the user is not authorized to perform the action on the indicated userId
     * @throws {PasswordsDoNotMatch} If the provided password and passwordConfirmation do not match
     * @throws {CannotPerformActionOnSocialAccount} If the user tries to update a password on a social account
     *
     * @param userId The id of the user to update
     * @param passwordPatchBody The password update data
     * @param authenticatedUser The authenticated user
     */
    async updatePassword(
        userId: string,
        passwordPatchBody: UserPasswordPatchBody,
        authenticatedUser: AuthenticatedUser
    ): Promise<void> {
        if (userId !== authenticatedUser.userId) {
            throw new NotAuthorized();
        }

        if (passwordPatchBody.password !== passwordPatchBody.password_confirmation) {
            throw new PasswordsDoNotMatch();
        }
        const user = await this.usersRepository.getUserById(authenticatedUser.userId);

        if (user.social) {
            throw new CannotPerformActionOnSocialAccount();
        }

        const [match] = await this.authService.validateCredentials(
            user.email,
            passwordPatchBody.old_password
        );
        if (!match) {
            throw new Error('Old password not correct');
        }

        const newPasswordHash = await this.authService.hashPassword(passwordPatchBody.password);

        user.password = newPasswordHash;

        await this.usersRepository.saveUser(user);
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
        authenticatedUser: AuthenticatedUser
    ): Promise<void> {
        if (userId !== authenticatedUser.userId) {
            throw new NotAuthorized();
        }

        const user = await this.usersRepository.getUserById(authenticatedUser.userId);

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
        password?: string
    ): Promise<void> {
        if (userId == '@self') {
            userId = authenticatedUser.userId;
        }

        if (authenticatedUser.userId != userId) {
            throw new NotAuthorized();
        }

        const user = await this.usersRepository.getUserById(userId);

        if (!user.social) {
            if (password == undefined) {
                throw new NotAuthorized();
            }

            const authorized = await this.authService.validateCredentials(user.email, password);
            if (!authorized[0]) {
                throw new NotAuthorized();
            }
        }

        await this.usersRepository.deleteUser(user.id);
    }

    /**
     * Check whether user with the given id exists.
     * @param id The id of the user to check
     */
    async existsUser(_id: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    /**
     * Check whether user with the given social id for the given social type exists.
     * @param socialId The id of the social account (this is not the userid!)
     * @param socialType socialType
     */
    async existsSocialUser(_socialId: string, _socialType: SocialType): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    /**
     * Check whether user with the given email exists.
     * @param id email
     */
    async existsUserEmail(_email: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
}
