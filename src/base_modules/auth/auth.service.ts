import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
    AuthenticatedUser,
    GithubAuthenticatedUser,
    GitlabAuthenticatedUser,
    TokenRefreshResponse,
    TokenResponse
} from 'src/types/auth/types';
import {
    AlreadyExists,
    CannotPerformActionOnSocialAccount,
    EntityNotFound,
    RegistrationNotVerified,
    WrongCredentials,
    FailedToAuthenticateSocialAccount
} from 'src/types/errors/types';
import { SocialType } from 'src/types/entities/frontend/User';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/base_modules/users/users.service';
import {
    CONST_JWT_TOKEN_EXPIRES_IN,
    CONST_PASSWORD_SALT_ROUNDS,
    CONST_REFRESH_JWT_TOKEN_EXPIRES_IN
} from './constants';
import * as bcrypt from 'bcrypt';
import ms = require('ms');
import { GitlabIntegrationTokenService } from 'src/base_modules/integrations/gitlab/gitlabToken.service';
import { User } from 'src/base_modules/users/users.entity';
import { UsersRepository } from '../users/users.repository';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private gitlabIntegrationTokenService: GitlabIntegrationTokenService,
        private userService: UsersService,
        @Inject(forwardRef(() => UsersRepository))
        private readonly usersRepository: UsersRepository,
    ) {}

    /**
     * Password and email account authentication
     *
     * @throws {WrongCredentials} If the user, with the given email, does not exist. Or the credentials do not match.
     * @throws {CannotPerformActionOnSocialAccount} If you try to authenticate with an account that is authenticated via oauth by the provider (gitlab, github)
     * @throws {RegistrationNotVerified} If the user has not yet confirmed the registration
     * @param email The email of the account used in the registration
     * @param password The account's password
     * @returns A JWT and Refresh token
     */
    async authenticate(email: string, password: string): Promise<TokenResponse> {
        const user = await this.usersRepository.getUserByEmail(email)

        if (!user) {
            throw new WrongCredentials();
        }

        if (user.social) {
            throw new CannotPerformActionOnSocialAccount();
        }

        if (!user.registration_verified) {
            try {
                await this.userService.sendUserRegistrationVerificationEmail(email);
            } catch (err) {
                // The user can resend the user registration verification email, so no need to throw here
            }
            throw new RegistrationNotVerified();
        }

        const [isValid, authenticatedUser] = await this.validateCredentials(email, password);

        if (!isValid) throw new WrongCredentials();
        const tokenResponse = this.signJWT(
            authenticatedUser!.id,
            ['ROLE_USER'],
            authenticatedUser!.activated
        );
        return tokenResponse;
    }

    /**
     * Authenticate with github OAuth sign-in. Creates an account if not exists, otherwise login.
     * @throws {NotAuthenticated} In case an error happened during the authentication.
     * @throws {FailedToAuthenticateSocialAccount} If an error happened during the registration.
     * @throws {AlreadyExists} A user with that email is already registered.
     * @param user The authenticated github user
     * @returns a signed JWT token and refresh token
     */
    async authenticateGithubSocial(user: GithubAuthenticatedUser): Promise<TokenResponse> {
        if (!user.email) {
            throw new FailedToAuthenticateSocialAccount();
        }

        // Check if a user with said social id exists
        const exists = await this.userService.existsSocialUser(
            user.github_user_id,
            SocialType.GITHUB
        );
        if (exists) {
            return await this.loginGithubSocial(user);
        } else {
            // If a user with said email already exists, it will throw
            return await this.registerGithubSocial(user);
        }
    }

    /**
     * Authenticate with gitlab OAuth sign-in. Creates an account if not exists, otherwise login.
     * @throws {FailedToAuthenticateSocialAccount} In case an error happened during the authentication.
     * @throws {FailedToCreateSocialAccount} If an error happened during the registration.
     * @throws {AlreadyExists} A user with that email is already registered.
     * @param user The authenticated gitlab user
     * @returns a signed JWT token and refresh token
     */
    async authenticateGitlabSocial(user: GitlabAuthenticatedUser): Promise<TokenResponse> {
        if (!user.email) {
            throw new FailedToAuthenticateSocialAccount();
        }

        // Check if a user with said social id exists
        const exists = await this.userService.existsSocialUser(
            user.gitlab_user_id,
            SocialType.GITLAB
        );
        if (exists) {
            return await this.loginGitlabSocial(user);
        } else {
            // If a user with said email already exists, it will throw
            return await this.registerGitlabSocial(user);
        }
    }

    /**
     * Create a JWT token
     * @param userId The user's id
     * @returns a signed JWT token and refresh token
     */
    private async signJWT(
        userId: string,
        roles: Array<string>,
        activated: boolean
    ): Promise<TokenResponse> {
        const current = new Date();
        const tokenExpiry = new Date(current.getTime() + ms(CONST_JWT_TOKEN_EXPIRES_IN));
        const refreshTokenExpiry = new Date(
            current.getTime() + ms(CONST_REFRESH_JWT_TOKEN_EXPIRES_IN)
        );
        // TODO: select roles
        const userObject = { sub: userId, userId: userId, roles: roles, activated: activated };
        return {
            token: await this.jwtService.signAsync(userObject),
            refresh_token: await this.jwtService.signAsync(userObject, {
                expiresIn: CONST_REFRESH_JWT_TOKEN_EXPIRES_IN
            }),
            token_expiry: tokenExpiry,
            refresh_token_expiry: refreshTokenExpiry
        };
    }

    /**
     * Refresh a JWT token
     * @param authenticatedUser The authenticatd user
     * @returns a signed JWT token but no refresh token
     */
    async refresh(authenticatedUser: AuthenticatedUser): Promise<TokenRefreshResponse> {
        const current = new Date();
        const tokenExpiry = new Date(current.getTime() + ms(CONST_JWT_TOKEN_EXPIRES_IN));
        return {
            token: await this.jwtService.signAsync({
                sub: authenticatedUser.userId,
                userId: authenticatedUser.userId,
                roles: authenticatedUser.roles,
                activated: authenticatedUser.activated
            }),
            token_expiry: tokenExpiry
        };
    }

    /**
     * Returns the authenticated user
     * @throws {EntityNotFound} In case the user does not exist.
     * @param authenticatedUser The authenticated user
     * @returns the authenticated user
     */
    async getAuthenticatedUser(authenticatedUser: AuthenticatedUser): Promise<User> {
        const user = await this.usersRepository.getUserById(authenticatedUser.userId, {
            default_org: true
        })
        if (!user) {
            throw new EntityNotFound();
        }
        return user;
    }

    /**
     * Login an account using the github Oauth login (if account exists)
     * @throws {FailedToAuthenticateSocialAccount} In case an error happened during the authentication.
     * @param authenticatedUser The authenticated github user
     * @returns a signed JWT token but no refresh token
     */
    async loginGithubSocial(githubUser: GithubAuthenticatedUser): Promise<TokenResponse> {
        if (!githubUser.email) {
            throw new FailedToAuthenticateSocialAccount();
        }

        const user = await this.usersRepository.getUserByEmail(githubUser.email)
        if (!user) {
            throw new FailedToAuthenticateSocialAccount();
        }
        return await this.signJWT(user.id, ['ROLE_USER'], user.activated);
    }

    /**
     * Login an account using the gitlab Oauth login (if account exists)
     * @throws {FailedToAuthenticateSocialAccount} In case an error happened during the authentication.
     * @param authenticatedUser The authenticated gitlab user
     * @returns a signed JWT token but no refresh token
     */
    async loginGitlabSocial(gitlabUser: GitlabAuthenticatedUser): Promise<TokenResponse> {
        if (!gitlabUser.email) {
            throw new FailedToAuthenticateSocialAccount();
        }

        const user = await this.usersRepository.getUserByEmail(gitlabUser.email)
        if (!user) {
            throw new FailedToAuthenticateSocialAccount();
        }
        // Gitlab revokes the old token during re-authentication, so we need to replace the old revoked one
        await this.gitlabIntegrationTokenService.updateOAuthTokenFromSignIn(
            user,
            gitlabUser.access_token,
            gitlabUser.refresh_token
        );

        return await this.signJWT(user.id, ['ROLE_USER'], user.activated);
    }

    /**
     * Register an account using the github Oauth login
     * @throws {AlreadyExists} In case an account with the same email already exists
     * @throws {FailedToAuthenticateSocialAccount} If an error happened during the registration
     * @param authenticatedUser The authenticated github user
     * @returns a signed JWT token but no refresh token
     */
    async registerGithubSocial(user: GithubAuthenticatedUser): Promise<TokenResponse> {
        if (!user.email) {
            throw new FailedToAuthenticateSocialAccount();
        }

        try {
            const existsUser = await this.userService.existsUserEmail(user.email);

            if (existsUser) {
                throw new AlreadyExists();
            }

            const id = await this.userService.registerSocial(
                user.email,
                user.access_token,
                SocialType.GITHUB,
                user.github_user_id,
                user.avatar_url,
                user.refresh_token
            );
            return await this.signJWT(id, ['ROLE_USER'], false);
        } catch (err) {
            if (err instanceof AlreadyExists) {
                throw err;
            }
            throw new FailedToAuthenticateSocialAccount(err);
        }
    }

    /**
     * Register an account using the gitlab Oauth login
     * @throws {AlreadyExists} In case an account with the same email already exists
     * @throws {FailedToAuthenticateSocialAccount} If an error happened during the registration
     * @param authenticatedUser The authenticated gitlab user
     * @returns a signed JWT token but no refresh token
     */
    async registerGitlabSocial(user: GitlabAuthenticatedUser): Promise<TokenResponse> {
        if (!user.email) {
            throw new FailedToAuthenticateSocialAccount();
        }

        try {
            const existsUser = await this.userService.existsUserEmail(user.email);

            if (existsUser) {
                throw new AlreadyExists();
            }

            const id = await this.userService.registerSocial(
                user.email,
                user.access_token,
                SocialType.GITLAB,
                user.gitlab_user_id,
                user.avatar_url,
                user.refresh_token,
                'https://gitlab.com'
            ); // TODO: take from conf
            return await this.signJWT(id, ['ROLE_USER'], false);
        } catch (err) {
            if (err instanceof AlreadyExists) {
                throw err;
            }
            throw new FailedToAuthenticateSocialAccount(err);
        }
    }

    /**
     * Hash password
     * @param password The password to hash
     * @returns the hashed password
     */
    async hashPassword(password: string) {
        const saltRounds = CONST_PASSWORD_SALT_ROUNDS;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        return hashedPassword;
    }

    /**
     * Validate a user's credentials
     * @throws {EntityNotFound} If the user, with the given email, does not exist
     * @param email The email used in the registration
     * @param password The password
     * @returns (1) if the credentials match, (2) a user object (if credentials matched)
     */
    async validateCredentials(
        email: string,
        password: string
    ): Promise<[boolean, User | undefined]> {
        const user = await this.usersRepository.getUserByEmail(email)

        if (!user) {
            return [false, undefined];
        }

        const passwordMatches = await bcrypt.compare(password, user.password);

        if (!passwordMatches) {
            return [false, undefined];
        }

        return [true, user];
    }
}
