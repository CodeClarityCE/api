import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { AuthenticatedUser } from 'src/types/auth/types';
import {
    AccountRegistrationVerificationTokenInvalidOrExpired,
    CannotPerformActionOnNormalAccount,
    CannotPerformActionOnSocialAccount,
    EntityNotFound,
    FailedToSendAccountRegistrationVerificationEmail,
    FailedToSendPasswordResetEmail,
    NotAuthorized,
    PasswordResetTokenInvalidOrExpired,
    PasswordsDoNotMatch,
    SetupAlreadyDone,
    SocialConnectionTypeNotSupported
} from 'src/types/errors/types';
import { OrganizationCreate } from 'src/types/entities/frontend/Org';
import {
    SocialType,
    UserCompleteSocialCreate,
    UserCompleteSocialCreateBody,
    UserCreateBody,
    UserCreateSocial,
    UserPasswordPatchBody
} from 'src/types/entities/frontend/User';
import { EmailService } from '../email/email.service';
import { genRandomString, hash } from 'src/utils/crypto';
import { GitlabIntegrationTokenService } from 'src/base_modules/integrations/gitlab/gitlabToken.service';
import { AuthService } from '../auth/auth.service';
import {
    EmailAction,
    EmailActionType,
    PasswordResetAction,
    PasswordResetCreate,
    RegistrationVerificationAction,
    UserRegistrationVerfificationCreate
} from 'src/types/entities/frontend/EmailAction';
import {
    GithubIntegrationCreate,
    GithubTokenType
} from 'src/types/entities/frontend/GithubIntegration';
import {
    GitLabIntegrationCreate,
    GitlabTokenType
} from 'src/types/entities/frontend/GitlabIntegration';
import { IntegrationType, IntegrationProvider } from 'src/types/entities/frontend/Integration';
import { User } from 'src/base_modules/users/users.entity';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import {
    MemberRole,
    OrganizationMemberships
} from 'src/base_modules/organizations/organization.memberships.entity';
import { Email, EmailType } from 'src/entity/codeclarity/Email';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationsRepository } from '../organizations/organizations.repository';

/**
 * This service offers methods for working with users
 */
@Injectable()
export class UsersService {
    constructor(
        private readonly emailService: EmailService,
        private readonly gitlabIntegrationTokenService: GitlabIntegrationTokenService,
        private readonly organizationsRepository: OrganizationsRepository,
        @Inject(forwardRef(() => AuthService))
        private readonly authService: AuthService,
        @InjectRepository(User, 'codeclarity')
        private userRepository: Repository<User>,
        @InjectRepository(Email, 'codeclarity')
        private emailRepository: Repository<Email>,
    ) { }

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

        const user = await this.userRepository.findOneBy({
            id: userId
        });

        if (!user) {
            throw new EntityNotFound();
        }

        return user;
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

        const user = await this.userRepository.findOne({
            where: {
                id: userId
            }
        });
        if (!user) {
            throw new EntityNotFound();
        }

        const organization = await this.organizationsRepository.getOrganizationById(orgId, {
            created_by: true,
            default: true
        }
    )
        if (!organization) {
            throw new EntityNotFound();
        }

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

        const user_created = await this.userRepository.save(user);

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
        } catch (err) {
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
        const user = await this.userRepository.findOneBy({
            email: email
        });

        if (!user) {
            throw new EntityNotFound();
        }

        // If the user's registration is already verified simply return
        if (user.registration_verified == true) {
            return;
        }

        // Find one registration action where EmailActionType.USERS_REGISTRATION_VERIFICATION, and user id
        const mail = await this.emailRepository.findOne({
            where: {
                email_type: EmailType.USERS_REGISTRATION_VERIFICATION,
                user: {
                    id: user.id
                }
            },
            relations: {
                user: true
            }
        });

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

            await this.emailRepository.save(mail);
        } else {
            mail.ttl = new Date(new Date().getTime() + 30 * 60000); // Expires after 30 mins
            mail.token_digest = activationTokenhash;
            await this.emailRepository.save(mail);
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
        const mail = await this.emailRepository.findOne({
            where: {
                token_digest: activationTokenhash,
                user_id_digest: userIdHash
            },
            relations: {
                user: true
            }
        });

        if (!mail) {
            throw new AccountRegistrationVerificationTokenInvalidOrExpired();
        }

        mail.user.activated = true;
        mail.user.registration_verified = true;

        await this.userRepository.save(mail.user);
        await this.emailRepository.remove(mail);
    }

    /**
     * Requests a password reset
     * @throws {FailedToSendPasswordResetEmail} If the email with the password reset failed to be sent
     *
     * @param email the email of the user
     */
    async requestPasswordReset(email: string): Promise<void> {
        throw new Error('Method not implemented.');
        // let transaction: RepositoryTransaction | undefined;
        // try {
        //     const userRepository = CodeclarityDB.getRepository(User);
        //     const user = await userRepository.findOneBy({
        //         email: email
        //     });

        //     if (!user) {
        //         throw new EntityNotFound();
        //     }

        //     if (user.social) {
        //         throw new CannotPerformActionOnSocialAccount();
        //     }

        //     transaction = await this.emailActionsRepository.withTransaction();
        //     await transaction.start();
        //     let action: EmailAction | undefined;
        //     try {
        //         action = await this.emailActionsRepository.findOne<PasswordResetAction>(
        //             {
        //                 junction: 'AND',
        //                 criteria: [
        //                     {
        //                         field: 'action_type',
        //                         value: EmailActionType.USERS_PASSWORD_RESET,
        //                         operator: 'eq'
        //                     },
        //                     {
        //                         field: 'user_id',
        //                         value: user.id,
        //                         operator: 'eq'
        //                     }
        //                 ]
        //             },
        //             { t: transaction }
        //         );
        //     } catch (err) {
        //         action = undefined;
        //     }

        //     const resetToken = await genRandomString(64);
        //     const userId = user.id;
        //     const resetTokenhash = await hash(resetToken, {});
        //     const userIdHash = await hash(userId, {});

        //     if (!action) {
        //         // Create a new one
        //         const userPasswordReset: PasswordResetCreate = {
        //             token_digest: resetTokenhash,
        //             action_type: EmailActionType.USERS_PASSWORD_RESET,
        //             user_id_digest: userIdHash,
        //             user_id: userId,
        //             ttl: new Date(new Date().getTime() + 5 * 60000) // Expires after 5 mins
        //         };

        //         await this.emailActionsRepository.create(userPasswordReset, {
        //             t: transaction
        //         });
        //     } else {
        //         // Refresh the old one
        //         await this.emailActionsRepository.refreshAction(
        //             action.id,
        //             resetTokenhash,
        //             new Date(new Date().getTime() + 30 * 60000),
        //             {
        //                 t: transaction
        //             }
        //         );
        //     }

        //     try {
        //         // attempt send the email
        //         await this.emailService.sendPasswordReset({
        //             email: user.email,
        //             token: resetToken,
        //             userIdDigest: userIdHash
        //         });
        //     } catch (err) {
        //         throw new FailedToSendPasswordResetEmail(err);
        //     }

        //     await transaction.commit();
        // } catch (err) {
        //     if (transaction) await transaction.abort();
        //     throw err;
        // }
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
        token: string,
        userIdHash: string,
        newPassword: string,
        newPasswordConfirmation: string
    ): Promise<void> {
        throw new Error('Method not implemented.');
        // let transaction: RepositoryTransaction | undefined;
        // try {
        //     const resetTokenhash = await hash(token, {});

        //     if (newPassword != newPasswordConfirmation) {
        //         throw new PasswordsDoNotMatch();
        //     }

        //     transaction = await this.emailActionsRepository.withTransaction();
        //     await this.emailActionsRepository.withTransactionDelete({ t: transaction });
        //     await this.usersRepository.withTransaction({ t: transaction });
        //     await transaction.start();

        //     let resetAction: PasswordResetAction;
        //     try {
        //         resetAction = await this.emailActionsRepository.findOnePasswordResetAction(
        //             {
        //                 junction: 'AND',
        //                 criteria: [
        //                     {
        //                         field: 'token_digest',
        //                         value: resetTokenhash,
        //                         operator: 'eq'
        //                     },
        //                     { field: 'user_id_digest', value: userIdHash, operator: 'eq' }
        //                 ]
        //             },
        //             { t: transaction }
        //         );
        //     } catch (err) {
        //         if (err instanceof EntityNotFound) {
        //             throw new PasswordResetTokenInvalidOrExpired();
        //         }
        //         throw err;
        //     }

        //     const passwordHash = await this.authService.hashPassword(newPassword);

        //     try {
        //         await this.usersRepository.update(
        //             resetAction.user_id,
        //             { password: passwordHash },
        //             { t: transaction }
        //         );
        //     } catch (err) {
        //         if (!(err instanceof EntityNotFound)) {
        //             throw err;
        //         }
        //     }

        //     await this.emailActionsRepository.delete(resetAction.id, { t: transaction });

        //     await transaction.commit();
        // } catch (err) {
        //     if (transaction) await transaction.abort();
        //     throw err;
        // }
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
        email: string,
        accessToken: string,
        socialType: SocialType,
        socialId: string,
        avatarUrl?: string,
        refreshToken?: string,
        integrationBaseUrl?: string
    ): Promise<string> {
        throw new Error('Method not implemented.');
        // let transaction: RepositoryTransaction | undefined;
        // try {
        //     if (socialType != SocialType.GITHUB && socialType != SocialType.GITLAB) {
        //         throw new SocialConnectionTypeNotSupported();
        //     }

        //     // Create a 'personal organization', which is an org that belongs to the user upon sign-up
        //     // This org cannot be deleted, nor can other users be invited to join this org
        //     const createOrg = (userKey: string): OrganizationCreate => {
        //         return {
        //             name: 'Personal Org',
        //             description: `Your Personal Organization`,
        //             created_on: new Date(),
        //             created_by: userKey,
        //             personal: true,
        //             color_scheme: '1'
        //         };
        //     };

        //     const user: UserCreateSocial = {
        //         email: email,
        //         social: true,
        //         setup_done: false,
        //         activated: false,
        //         social_register_type: socialType,
        //         social_id: socialId,
        //         avatar_url: avatarUrl,
        //         created_on: new Date()
        //     };

        //     transaction = await this.usersRepository.withTransaction();
        //     await this.orgsRepository.withTransaction({ t: transaction });
        //     if (socialType == SocialType.GITHUB) {
        //         await this.githubRepo.withTransaction({ t: transaction });
        //     } else if (socialType == SocialType.GITLAB) {
        //         await this.gitlabRepo.withTransaction({ t: transaction });
        //     }
        //     await this.orgsRepository.withTransaction();
        //     await transaction.start();

        //     const userId = await this.usersRepository.createSocial(user, { t: transaction });
        //     const orgId = await this.orgsRepository.create(createOrg(userId), userId, {
        //         t: transaction
        //     });

        //     let integrationId;
        //     if (socialType == SocialType.GITHUB) {
        //         const integ: GithubIntegrationCreate = {
        //             integration_type: IntegrationType.VCS,
        //             integration_provider: IntegrationProvider.GITHUB,
        //             access_token: accessToken, // TODO: encrypt
        //             refresh_token: refreshToken, // TODO: encrypt
        //             token_type: GithubTokenType.OAUTH_TOKEN,
        //             invalid: false,
        //             added_on: new Date(),
        //             added_by: userId,
        //             service_domain: 'github.com',
        //             organization_id: orgId,
        //             meta_data: {}
        //         };
        //         integrationId = await this.githubRepo.create(integ, orgId, { t: transaction });
        //     } else if (socialType == SocialType.GITLAB) {
        //         if (!integrationBaseUrl) {
        //             await transaction.abort();
        //             throw new Error(
        //                 'Integration base url must be defined when creating gitlab social account.'
        //             );
        //         }

        //         // eslint-disable-next-line @typescript-eslint/no-unused-vars
        //         const [_, expiryDate] =
        //             await this.gitlabIntegrationTokenService.getOAuthTokenExpiryRemote(accessToken);
        //         const integ: GitLabIntegrationCreate = {
        //             integration_type: IntegrationType.VCS,
        //             integration_provider: IntegrationProvider.GITLAB,
        //             access_token: accessToken, // TODO: encrypt
        //             refresh_token: refreshToken, // TODO: encrypt
        //             service_base_url: integrationBaseUrl,
        //             token_type: GitlabTokenType.OAUTH_TOKEN,
        //             expiry_date: expiryDate,
        //             invalid: false,
        //             added_on: new Date(),
        //             added_by: userId,
        //             service_domain: new URL(integrationBaseUrl).hostname,
        //             organization_id: orgId,
        //             meta_data: {}
        //         };
        //         integrationId = await this.gitlabRepo.create(integ, orgId, { t: transaction });
        //     } else {
        //         await transaction.abort();
        //         throw new SocialConnectionTypeNotSupported();
        //     }

        //     await this.usersRepository.update(
        //         userId,
        //         {
        //             default_org: orgId,
        //             personal_org: orgId,
        //             oauth_integration: integrationId
        //         },
        //         { t: transaction }
        //     );
        //     await transaction.commit();
        //     return userId;
        // } catch (err) {
        //     if (transaction) await transaction.abort();
        //     throw err;
        // }
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
        userCompleteSocial: UserCompleteSocialCreateBody,
        authenticatedUser: AuthenticatedUser
    ): Promise<string> {
        throw new Error('Method not implemented.');
        // const userRepository = CodeclarityDB.getRepository(User);
        // const user = await userRepository.findOneBy({
        //     id: authenticatedUser.userId
        // });

        // if (!user) {
        //     throw new EntityNotFound();
        // }

        // if (!user.social) {
        //     throw new CannotPerformActionOnNormalAccount();
        // }

        // if (user.setup_done) {
        //     throw new SetupAlreadyDone();
        // }

        // const userUpdate: UserCompleteSocialCreate = {
        //     first_name: userCompleteSocial.first_name,
        //     last_name: userCompleteSocial.last_name,
        //     handle: userCompleteSocial.handle,
        //     setup_done: true
        // };

        // await this.usersRepository.update(user.id, userUpdate);

        // return user.id;
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
        throw new Error('Method not implemented.');
        // if (userId == '@self') {
        //     userId = authenticatedUser.userId;
        // }

        // if (authenticatedUser.userId != userId) {
        //     throw new NotAuthorized();
        // }

        // if (passwordPatchBody.password != passwordPatchBody.password_confirmation) {
        //     throw new PasswordsDoNotMatch();
        // }

        // const userRepository = CodeclarityDB.getRepository(User);
        // const user = await userRepository.findOneBy({
        //     id: userId
        // });

        // if (!user) {
        //     throw new EntityNotFound();
        // }

        // if (user.social) {
        //     throw new CannotPerformActionOnSocialAccount();
        // }

        // const authorized = await this.authService.validateCredentials(
        //     user.email,
        //     passwordPatchBody.old_password
        // );
        // if (!authorized) {
        //     throw new NotAuthorized();
        // }

        // const passwordHash = await this.authService.hashPassword(passwordPatchBody.password);

        // await this.usersRepository.update(userId, { password: passwordHash });
    }

    // /**
    //  * Update a user's personal information
    //  * @throws {EntityNotFound} If the user does not exist
    //  * @throws {NotAuthorized} If the user is not authorized to perform the action on the indicated userId
    //  *
    //  * @param userId The id of the user to update
    //  * @param userPatchBody The personal info update data
    //  * @param authenticatedUser The authenticated user
    //  */
    // async updatePersonalInfo(
    //     userId: string,
    //     userPatchBody: UserPatchBody,
    //     authenticatedUser: AuthenticatedUser
    // ): Promise<void> {
    //     if (Object.keys(userPatchBody).length == 0) return;

    //     if (userId == '@self') {
    //         userId = authenticatedUser.userId;
    //     }

    //     if (authenticatedUser.userId != userId) {
    //         throw new NotAuthorized();
    //     }

    //     const patch: Partial<User> = {};

    //     // Only assign those fields which we allow to be changed
    //     if (userPatchBody.last_name) patch.last_name = userPatchBody.last_name;
    //     if (userPatchBody.first_name) patch.first_name = userPatchBody.first_name;

    //     await this.usersRepository.update(userId, patch);
    // }

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

        const user = await this.userRepository.findOneBy({
            id: userId
        });

        if (!user) {
            throw new EntityNotFound();
        }

        if (!user.social) {
            if (password == undefined) {
                throw new NotAuthorized();
            }

            const authorized = await this.authService.validateCredentials(user.email, password);
            if (!authorized[0]) {
                throw new NotAuthorized();
            }
        }

        await this.userRepository.delete(user.id);
    }

    /**
     * Check whether user with the given id exists.
     * @param id The id of the user to check
     */
    async existsUser(id: string): Promise<boolean> {
        throw new Error('Method not implemented.');
        // return await this.usersRepository.exists(id);
    }

    /**
     * Check whether user with the given social id for the given social type exists.
     * @param socialId The id of the social account (this is not the userid!)
     * @param socialType socialType
     */
    async existsSocialUser(socialId: string, socialType: SocialType): Promise<boolean> {
        throw new Error('Method not implemented.');
        // try {
        //     await this.usersRepository.findOne({
        //         junction: 'AND',
        //         criteria: [
        //             {
        //                 field: 'social_id',
        //                 value: socialId,
        //                 operator: 'eq'
        //             },
        //             {
        //                 field: 'social_register_type',
        //                 value: socialType,
        //                 operator: 'eq'
        //             }
        //         ]
        //     });
        //     return true;
        // } catch (err) {
        //     if (err instanceof EntityNotFound) return false;
        //     throw err;
        // }
    }

    /**
     * Check whether user with the given email exists.
     * @param id email
     */
    async existsUserEmail(email: string): Promise<boolean> {
        throw new Error('Method not implemented.');
        // try {
        //     await this.usersRepository.findOne({
        //         field: 'email',
        //         value: email,
        //         operator: 'eq'
        //     });
        //     return true;
        // } catch (err) {
        //     if (err instanceof EntityNotFound) return false;
        //     throw err;
        // }
    }
}
