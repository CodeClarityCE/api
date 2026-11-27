import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  AuthenticateBody,
  AuthenticatedUser,
  RefreshTokenBody,
  TokenRefreshResponse,
  TokenResponse,
  UserPasswordResetBody,
  UserPasswordResetRequestBody,
} from "src/base_modules/auth/auth.types";
import {
  RegistrationConfirmationBody,
  UserCreateBody,
} from "src/base_modules/users/user.types";
import { User } from "src/base_modules/users/users.entity";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { APIDocCreatedResponseDecorator } from "src/decorators/CrudResponse";
import { APIDocNoDataResponseDecorator } from "src/decorators/NoDataResponse";
import { NonAuthEndpoint } from "src/decorators/SkipAuthDecorator";
import { APIDocTypedResponseDecorator } from "src/decorators/TypedResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  CreatedResponse,
  NoDataResponse,
  TypedResponse,
} from "src/types/apiResponses.types";
import {
  EmailAlreadyExists,
  EntityNotFound,
  NotAuthenticated,
} from "src/types/error.types";

import { CannotPerformActionOnSocialAccount } from "../users/users.errors";
import { UsersService } from "../users/users.service";

import {
  AccountRegistrationVerificationTokenInvalidOrExpired,
  HandleAlreadyExists,
  PasswordResetTokenInvalidOrExpired,
  PasswordsDoNotMatch,
  RegistrationNotVerified,
  WrongCredentials,
} from "./auth.errors";
import { AuthService } from "./auth.service";
import { CombinedAuthGuard } from "./guards/combined.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @ApiTags("Auth")
  @ApiOperation({ description: "Start an analysis on the project." })
  @APIDocCreatedResponseDecorator()
  @ApiErrorDecorator({ statusCode: 400, errors: [PasswordsDoNotMatch] })
  @ApiErrorDecorator({
    statusCode: 409,
    errors: [EmailAlreadyExists, HandleAlreadyExists],
  })
  @NonAuthEndpoint()
  @Post("/register")
  async registerAccount(
    @Body() user: UserCreateBody,
  ): Promise<CreatedResponse> {
    return { id: await this.usersService.register(user) };
  }

  @ApiTags("Auth")
  @ApiOperation({ description: "Get the authenticated user." })
  @APIDocTypedResponseDecorator(User)
  @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
  @UseGuards(CombinedAuthGuard)
  @ApiBearerAuth()
  @Get("/user")
  async getAuthenticatedAccount(
    @AuthUser() user: AuthenticatedUser,
  ): Promise<TypedResponse<User>> {
    return { data: await this.authService.getAuthenticatedUser(user) };
  }

  @ApiTags("Auth")
  @ApiOperation({ description: "Authenticate." })
  @APIDocTypedResponseDecorator(TokenResponse)
  @ApiErrorDecorator({
    statusCode: 400,
    errors: [
      WrongCredentials,
      RegistrationNotVerified,
      CannotPerformActionOnSocialAccount,
    ],
  })
  @NonAuthEndpoint()
  @Post("/authenticate")
  async authenticate(
    @Body() body: AuthenticateBody,
  ): Promise<TypedResponse<TokenResponse>> {
    return {
      data: await this.authService.authenticate(body.email, body.password),
    };
  }

  @ApiTags("Auth")
  @ApiOperation({
    description: "Confirm your registration via the token sent by email.",
  })
  @APIDocNoDataResponseDecorator()
  @ApiErrorDecorator({
    statusCode: 400,
    errors: [AccountRegistrationVerificationTokenInvalidOrExpired],
  })
  @NonAuthEndpoint()
  @Post("/confirm_registration")
  async confirmRegistration(
    @Body() registrationConfirmationBody: RegistrationConfirmationBody,
  ): Promise<NoDataResponse> {
    await this.usersService.confirmRegistration(
      registrationConfirmationBody.token,
      registrationConfirmationBody.user_id_hash,
    );
    return {};
  }

  @ApiTags("Auth")
  @ApiOperation({ description: "Request a password reset." })
  @APIDocNoDataResponseDecorator(201)
  @NonAuthEndpoint()
  @Post("/request_password_reset")
  async requestPasswordReset(
    @Body() userPasswordResetRequestBody: UserPasswordResetRequestBody,
  ): Promise<NoDataResponse> {
    await this.usersService.requestPasswordReset(
      userPasswordResetRequestBody.email,
    );
    return {};
  }

  @ApiTags("Auth")
  @ApiOperation({
    description: "Reset your password via the token sent by email.",
  })
  @APIDocNoDataResponseDecorator()
  @ApiErrorDecorator({
    statusCode: 400,
    errors: [PasswordsDoNotMatch, PasswordResetTokenInvalidOrExpired],
  })
  @NonAuthEndpoint()
  @Post("/password_reset")
  async passwordReset(
    @Body() userPasswordResetBody: UserPasswordResetBody,
  ): Promise<NoDataResponse> {
    await this.usersService.resetPassword(
      userPasswordResetBody.token,
      userPasswordResetBody.user_id_hash,
      userPasswordResetBody.new_password,
      userPasswordResetBody.new_password_confirmation,
    );
    return {};
  }

  @ApiTags("Auth")
  @ApiOperation({
    description:
      "Trade a refresh token for a new access token and a new refresh token. A refresh token works once; using it again ends its sign-in.",
  })
  @APIDocTypedResponseDecorator(TokenRefreshResponse)
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @NonAuthEndpoint()
  @Post("/refresh")
  async refresh(
    @Body() body: RefreshTokenBody,
  ): Promise<TypedResponse<TokenRefreshResponse>> {
    return { data: await this.authService.refresh(body?.refresh_token) };
  }

  @ApiTags("Auth")
  @ApiOperation({
    description:
      "Sign out: the refresh token's sign-in stops working. An unknown token is accepted too.",
  })
  @APIDocNoDataResponseDecorator(201)
  @NonAuthEndpoint()
  @Post("/sign_out")
  async signOut(@Body() body: RefreshTokenBody): Promise<NoDataResponse> {
    await this.authService.signOut(body?.refresh_token);
    return {};
  }
}
