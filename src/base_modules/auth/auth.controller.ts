import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  AuthenticateBody,
  AuthenticatedUser,
  sessionExpiryOf,
  SessionExpiryResponse,
  UserPasswordResetBody,
  UserPasswordResetRequestBody,
} from "src/base_modules/auth/auth.types";
import {
  RegistrationConfirmationBody,
  UserCreateBody,
} from "src/base_modules/users/user.types";
import { User } from "src/base_modules/users/users.entity";
import { ApiAuthentication } from "src/decorators/ApiAuthDecorator";
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
  CrossSiteRequestRefused,
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
import {
  assertSameOrigin,
  clearSessionCookies,
  readCookie,
  REFRESH_COOKIE,
  setSessionCookies,
} from "./session-cookies";

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
  @ApiAuthentication()
  @Get("/user")
  async getAuthenticatedAccount(
    @AuthUser() user: AuthenticatedUser,
  ): Promise<TypedResponse<User>> {
    return { data: await this.authService.getAuthenticatedUser(user) };
  }

  @ApiTags("Auth")
  @ApiOperation({
    description:
      "Sign in. The access and refresh tokens are set as HttpOnly cookies, never returned in the body; later requests send the cookies with the x-codeclarity-csrf: 1 header.",
  })
  @APIDocTypedResponseDecorator(SessionExpiryResponse)
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
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TypedResponse<SessionExpiryResponse>> {
    const tokens = await this.authService.authenticate(
      body.email,
      body.password,
    );
    setSessionCookies(reply, tokens);
    return { data: sessionExpiryOf(tokens) };
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
      "Trade the refresh cookie for new access and refresh cookies. A refresh token works once; using it again ends its sign-in. A refused refresh clears both cookies.",
  })
  @APIDocTypedResponseDecorator(SessionExpiryResponse)
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [CrossSiteRequestRefused] })
  @ApiSecurity({ cookie: [], "csrf-header": [] })
  @NonAuthEndpoint()
  @Post("/refresh")
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TypedResponse<SessionExpiryResponse>> {
    // Checked first, so a cross-site request cannot spend the token.
    assertSameOrigin(request.headers);
    try {
      const tokens = await this.authService.refresh(
        readCookie(request.headers, REFRESH_COOKIE),
      );
      setSessionCookies(reply, tokens);
      return { data: sessionExpiryOf(tokens) };
    } catch (error) {
      if (error instanceof NotAuthenticated) clearSessionCookies(reply);
      throw error;
    }
  }

  @ApiTags("Auth")
  @ApiOperation({
    description:
      "Sign out: the refresh cookie's sign-in stops working and both cookies are cleared. A missing or unknown token is accepted too.",
  })
  @APIDocNoDataResponseDecorator(201)
  @ApiErrorDecorator({ statusCode: 403, errors: [CrossSiteRequestRefused] })
  @ApiSecurity({ cookie: [], "csrf-header": [] })
  @NonAuthEndpoint()
  @Post("/sign_out")
  async signOut(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<NoDataResponse> {
    assertSameOrigin(request.headers);
    await this.authService.signOut(readCookie(request.headers, REFRESH_COOKIE));
    clearSessionCookies(reply);
    return {};
  }
}
