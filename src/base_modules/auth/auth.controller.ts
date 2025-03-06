import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { NonAuthEndpoint } from 'src/decorators/SkipAuthDecorator';
import { AuthUser } from 'src/decorators/UserDecorator';
import {
    AuthenticateBody,
    AuthenticatedUser,
    TokenRefreshResponse,
    TokenResponse,
    UserPasswordResetBody,
    UserPasswordResetRequestBody
} from 'src/base_modules/auth/auth.types';
import { AuthService } from './auth.service';
import { RefreshJwtAuthGuard } from './guards/refresh-token.guard';
import { UserCreateBody, RegistrationConfirmationBody } from 'src/base_modules/users/user.types';
import { UsersService } from '../users/users.service';
import { CreatedResponse, NoDataResponse, TypedResponse } from 'src/types/apiResponses.types';
import { CombinedAuthGuard } from './guards/combined.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import {
    EmailAlreadyExists,
    EntityNotFound,
} from 'src/types/error.types';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import { User } from 'src/base_modules/users/users.entity';
import { CannotPerformActionOnSocialAccount } from '../users/users.errors';
import { AccountRegistrationVerificationTokenInvalidOrExpired, HandleAlreadyExists, PasswordResetTokenInvalidOrExpired, PasswordsDoNotMatch, RegistrationNotVerified, WrongCredentials } from './auth.errors';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly usersService: UsersService
    ) {}

    @ApiTags('Auth')
    @ApiOperation({ description: 'Start an analysis on the project.' })
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 400, errors: [PasswordsDoNotMatch] })
    @ApiErrorDecorator({ statusCode: 409, errors: [EmailAlreadyExists, HandleAlreadyExists] })
    @NonAuthEndpoint()
    @Post('/register')
    async registerAccount(@Body() user: UserCreateBody): Promise<CreatedResponse> {
        return { id: await this.usersService.register(user) };
    }

    @ApiTags('Auth')
    @ApiOperation({ description: 'Get the authenticated user.' })
    @APIDocTypedResponseDecorator(User)
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @UseGuards(CombinedAuthGuard)
    @Get('/user')
    async getAuthenticatedAccount(
        @AuthUser() user: AuthenticatedUser
    ): Promise<TypedResponse<User>> {
        return { data: await this.authService.getAuthenticatedUser(user) };
    }

    @ApiTags('Auth')
    @ApiOperation({ description: 'Authenticate.' })
    @APIDocTypedResponseDecorator(TokenResponse)
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [WrongCredentials, RegistrationNotVerified, CannotPerformActionOnSocialAccount]
    })
    @NonAuthEndpoint()
    @Post('/authenticate')
    async authenticate(@Body() body: AuthenticateBody): Promise<TypedResponse<TokenResponse>> {
        return { data: await this.authService.authenticate(body.email, body.password) };
    }

    @ApiTags('Auth')
    @ApiOperation({ description: 'Confirm your registration via the token sent by email.' })
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [AccountRegistrationVerificationTokenInvalidOrExpired]
    })
    @NonAuthEndpoint()
    @Post('/confirm_registration')
    async confirmRegistration(
        @Body() registrationConfirmationBody: RegistrationConfirmationBody
    ): Promise<NoDataResponse> {
        await this.usersService.confirmRegistration(
            registrationConfirmationBody.token,
            registrationConfirmationBody.user_id_hash
        );
        return {};
    }

    @ApiTags('Auth')
    @ApiOperation({ description: 'Request a password reset.' })
    @APIDocNoDataResponseDecorator(201)
    @NonAuthEndpoint()
    @Post('/request_password_reset')
    async requestPasswordReset(
        @Body() userPasswordResetRequestBody: UserPasswordResetRequestBody
    ): Promise<NoDataResponse> {
        await this.usersService.requestPasswordReset(userPasswordResetRequestBody.email);
        return {};
    }

    @ApiTags('Auth')
    @ApiOperation({ description: 'Reset your password via the token sent by email.' })
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [PasswordsDoNotMatch, PasswordResetTokenInvalidOrExpired]
    })
    @NonAuthEndpoint()
    @Post('/password_reset')
    async passwordReset(
        @Body() userPasswordResetBody: UserPasswordResetBody
    ): Promise<NoDataResponse> {
        await this.usersService.resetPassword(
            userPasswordResetBody.token,
            userPasswordResetBody.user_id_hash,
            userPasswordResetBody.new_password,
            userPasswordResetBody.new_password_confirmation
        );
        return {};
    }

    @ApiTags('Auth')
    @ApiOperation({ description: 'Refresh your jwt token.' })
    @APIDocTypedResponseDecorator(TokenRefreshResponse)
    @UseGuards(RefreshJwtAuthGuard)
    @NonAuthEndpoint()
    @Post('/refresh')
    async refresh(
        @AuthUser() user: AuthenticatedUser
    ): Promise<TypedResponse<TokenRefreshResponse>> {
        return { data: await this.authService.refresh(user) };
    }
}
