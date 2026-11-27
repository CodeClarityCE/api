import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import ms from "ms";

import {
  AuthenticatedUser,
  ROLE,
  type SignInTokens,
} from "src/base_modules/auth/auth.types";
import { UsersRepository } from "src/base_modules/shared/repositories";
import { User } from "src/base_modules/users/users.entity";
import { UsersService } from "src/base_modules/users/users.service";
import {
  EntityNotFound,
  NotAuthenticated,
  UserDoesNotExist,
} from "src/types/error.types";

import { CannotPerformActionOnSocialAccount } from "../users/users.errors";

import { RegistrationNotVerified, WrongCredentials } from "./auth.errors";
import { CONST_JWT_TOKEN_EXPIRES_IN } from "./constants";
import { hashPassword } from "./password";
import { RefreshTokensService } from "./refresh-tokens.service";
import { signOptionsFor, TokenKind } from "./token-kinds";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private userService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly refreshTokens: RefreshTokensService,
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
  async authenticate(email: string, password: string): Promise<SignInTokens> {
    // An unknown email gets the same error as a wrong password.
    const user = await this.usersRepository
      .getUserByEmail(email)
      .catch((err: unknown) => {
        if (err instanceof UserDoesNotExist) throw new WrongCredentials();
        throw err;
      });

    if (!user) {
      throw new WrongCredentials();
    }

    if (user.social) {
      throw new CannotPerformActionOnSocialAccount();
    }

    if (!user.registration_verified) {
      try {
        await this.userService.sendUserRegistrationVerificationEmail(email);
      } catch {
        // The user can resend the user registration verification email, so no need to throw here
      }
      throw new RegistrationNotVerified();
    }

    const [isValid, authenticatedUser] = await this.validateCredentials(
      email,
      password,
    );

    if (!isValid) throw new WrongCredentials();
    return this.startSignIn(authenticatedUser!);
  }

  /** Starts a new sign-in for the user: an access token and a refresh token in a new family. */
  async startSignIn(user: User): Promise<SignInTokens> {
    const refresh = await this.refreshTokens.issue(user.id);
    return {
      ...(await this.signAccessToken(user)),
      refreshToken: refresh.token,
      refreshExpiry: refresh.expiresOn,
    };
  }

  /** Signs a 15 minute access token from the user's current row. */
  private async signAccessToken(
    user: User,
  ): Promise<{ accessToken: string; accessExpiry: Date }> {
    const accessExpiry = new Date(Date.now() + ms(CONST_JWT_TOKEN_EXPIRES_IN));
    return {
      accessToken: await this.jwtService.signAsync(
        {
          sub: user.id,
          userId: user.id,
          roles: [ROLE.USER],
          activated: user.activated,
        },
        signOptionsFor(TokenKind.ACCESS),
      ),
      accessExpiry,
    };
  }

  /**
   * Rotates a refresh token: the old one is spent, and a new access and
   * refresh token are returned. The user must still be allowed to sign in.
   * @throws {NotAuthenticated} for a token that cannot be used, or a user who may no longer sign in
   */
  async refresh(refreshToken: unknown): Promise<SignInTokens> {
    const next = await this.refreshTokens.rotate(refreshToken);
    const user = await this.usersRepository
      .getUserById(next.userId)
      .catch((err: unknown) => {
        if (err instanceof EntityNotFound) return undefined;
        throw err;
      });
    if (!user || user.social || !user.registration_verified) {
      await this.refreshTokens.revokeFamily(next.familyId);
      throw new NotAuthenticated();
    }
    return {
      ...(await this.signAccessToken(user)),
      refreshToken: next.token,
      refreshExpiry: next.expiresOn,
    };
  }

  /** Ends the sign-in the refresh token belongs to; an unknown token does nothing. */
  async signOut(refreshToken: unknown): Promise<void> {
    await this.refreshTokens.revokeFamilyOf(refreshToken);
  }

  /** Ends every sign-in of the user, such as after a password change. */
  async signOutEverywhere(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllOf(userId);
  }

  /**
   * Returns the authenticated user
   * @throws {EntityNotFound} In case the user does not exist.
   * @param authenticatedUser The authenticated user
   * @returns the authenticated user
   */
  async getAuthenticatedUser(
    authenticatedUser: AuthenticatedUser,
  ): Promise<User> {
    const user = await this.usersRepository.getUserById(
      authenticatedUser.userId,
      {
        default_org: true,
      },
    );
    if (!user) {
      throw new EntityNotFound();
    }
    return user;
  }

  /**
   * Hash password
   * @param password The password to hash
   * @returns the hashed password
   */
  async hashPassword(password: string): Promise<string> {
    return hashPassword(password);
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
    password: string,
  ): Promise<[boolean, User | undefined]> {
    const user = await this.usersRepository.getUserByEmail(email);

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
