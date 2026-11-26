import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import ms from "ms";

import {
  AuthenticatedUser,
  TokenRefreshResponse,
  TokenResponse,
} from "src/base_modules/auth/auth.types";
import { UsersRepository } from "src/base_modules/shared/repositories";
import { User } from "src/base_modules/users/users.entity";
import { UsersService } from "src/base_modules/users/users.service";
import { EntityNotFound, UserDoesNotExist } from "src/types/error.types";

import { CannotPerformActionOnSocialAccount } from "../users/users.errors";

import { RegistrationNotVerified, WrongCredentials } from "./auth.errors";
import {
  CONST_JWT_TOKEN_EXPIRES_IN,
  CONST_REFRESH_JWT_TOKEN_EXPIRES_IN,
} from "./constants";
import { hashPassword } from "./password";
import { signOptionsFor, TokenKind } from "./token-kinds";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private userService: UsersService,
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
    const tokenResponse = this.signJWT(
      authenticatedUser!.id,
      ["ROLE_USER"],
      authenticatedUser!.activated,
    );
    return tokenResponse;
  }

  /**
   * Create a JWT token
   * @param userId The user's id
   * @returns a signed JWT token and refresh token
   */
  private async signJWT(
    userId: string,
    roles: string[],
    activated: boolean,
  ): Promise<TokenResponse> {
    const current = new Date();
    const tokenExpiry = new Date(
      current.getTime() + ms(CONST_JWT_TOKEN_EXPIRES_IN),
    );
    const refreshTokenExpiry = new Date(
      current.getTime() + ms(CONST_REFRESH_JWT_TOKEN_EXPIRES_IN),
    );
    // TODO: select roles
    const userObject = {
      sub: userId,
      userId: userId,
      roles: roles,
      activated: activated,
    };
    return {
      token: await this.jwtService.signAsync(
        userObject,
        signOptionsFor(TokenKind.ACCESS),
      ),
      refresh_token: await this.jwtService.signAsync(
        userObject,
        signOptionsFor(TokenKind.REFRESH),
      ),
      token_expiry: tokenExpiry,
      refresh_token_expiry: refreshTokenExpiry,
    };
  }

  /**
   * Refresh a JWT token
   * @param authenticatedUser The authenticatd user
   * @returns a signed JWT token but no refresh token
   */
  async refresh(
    authenticatedUser: AuthenticatedUser,
  ): Promise<TokenRefreshResponse> {
    const current = new Date();
    const tokenExpiry = new Date(
      current.getTime() + ms(CONST_JWT_TOKEN_EXPIRES_IN),
    );
    return {
      token: await this.jwtService.signAsync(
        {
          sub: authenticatedUser.userId,
          userId: authenticatedUser.userId,
          roles: authenticatedUser.roles,
          activated: authenticatedUser.activated,
        },
        signOptionsFor(TokenKind.ACCESS),
      ),
      token_expiry: tokenExpiry,
    };
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
