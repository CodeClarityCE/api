import { Controller, Post, Body, Get, Patch, Delete, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { CreatedResponse, NoDataResponse, TypedResponse } from 'src/types/apiResponses.types';
import { NonAuthEndpoint } from 'src/decorators/SkipAuthDecorator';
import { ApiTags } from '@nestjs/swagger';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import {
    CannotPerformActionOnNormalAccount,
    CannotPerformActionOnSocialAccount,
    EntityNotFound,
    FailedToSendAccountRegistrationVerificationEmail,
    AccountRegistrationVerificationTokenInvalidOrExpired,
    InternalError,
    NotAuthorized,
    PasswordsDoNotMatch,
    SetupAlreadyDone,
    Unsupported
} from 'src/types/error.types';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import {
    DefaultOrgPatchBody,
    DeleteAccountBody,
    ResendAccountRegEmailBody,
    UserCompleteSocialCreateBody,
    UserPasswordPatchBody,
    RegistrationConfirmationBody
} from 'src/base_modules/users/user.types';
import { User } from 'src/base_modules/users/users.entity';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @ApiTags('Users')
    @APIDocTypedResponseDecorator(User)
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':user_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('user_id') user_id: string
    ): Promise<TypedResponse<User>> {
        return { data: await this.usersService.getUser(user_id, user) };
    }

    @ApiTags('Users')
    @NonAuthEndpoint()
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({
        statusCode: 500,
        errors: [InternalError, FailedToSendAccountRegistrationVerificationEmail]
    })
    @Post(':email')
    async reSendAccountRegVerificationEmail(
        @Body() body: ResendAccountRegEmailBody
    ): Promise<NoDataResponse> {
        await this.usersService.sendUserRegistrationVerificationEmail(body.email);
        return {};
    }

    @ApiTags('Users')
    @NonAuthEndpoint()
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({
        statusCode: 500,
        errors: [InternalError, AccountRegistrationVerificationTokenInvalidOrExpired]
    })
    @Post('confirm_registration')
    async confirmRegistration(@Body() body: RegistrationConfirmationBody): Promise<NoDataResponse> {
        await this.usersService.confirmRegistration(body.token, body.user_id_hash);
        return {};
    }

    @ApiTags('Users')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Delete(':user_id')
    async deleteAccount(
        @AuthUser() user: AuthenticatedUser,
        @Param('user_id') user_id: string,
        @Body() body: DeleteAccountBody
    ): Promise<NoDataResponse> {
        await this.usersService.delete(user_id, user, body.password);
        return {};
    }

    @ApiTags('Users')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [CannotPerformActionOnNormalAccount, SetupAlreadyDone, Unsupported]
    })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Post('complete_social_setup')
    async completeSocialAccountSetup(
        @AuthUser() user: AuthenticatedUser,
        @Body() account_setup_data: UserCompleteSocialCreateBody
    ): Promise<CreatedResponse> {
        return { id: await this.usersService.completeSocialAccountSetup(account_setup_data, user) };
    }

    @ApiTags('Users')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [CannotPerformActionOnSocialAccount, PasswordsDoNotMatch]
    })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Patch(':user_id/update_password')
    async updateAccountPassword(
        @AuthUser() user: AuthenticatedUser,
        @Body() patch: UserPasswordPatchBody,
        @Param('user_id') user_id: string
    ): Promise<NoDataResponse> {
        await this.usersService.updatePassword(user_id, patch, user);
        return {};
    }

    // @ApiTags('Users')
    // @APIDocNoDataResponseDecorator()
    // @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    // @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    // @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    // @Patch(':user_id/update_personal')
    // async updateAccountInfo(
    //     @AuthUser() user: AuthenticatedUser,
    //     @Body() patch: UserPatchBody,
    //     @Param('user_id') user_id: string
    // ): Promise<NoDataResponse> {
    //     await this.usersService.updatePersonalInfo(user_id, patch, user);
    //     return {};
    // }

    @ApiTags('Users')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Patch(':user_id/update_default_org')
    async updateDefaultOrg(
        @AuthUser() user: AuthenticatedUser,
        @Body() patch: DefaultOrgPatchBody,
        @Param('user_id') user_id: string
    ): Promise<NoDataResponse> {
        await this.usersService.setDefaultOrg(user_id, patch.default_org, user);
        return {};
    }
}
