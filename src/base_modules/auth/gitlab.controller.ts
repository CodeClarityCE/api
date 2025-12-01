import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import axios, { AxiosError } from 'axios';
import { FastifyReply } from 'fastify';
import {
    GitlabAuthenticatedUser,
    Oauth2FinalizeBody,
    Oauth2InitQuery,
    TokenResponse
} from 'src/base_modules/auth/auth.types';
import {
    GitlabUserResponse,
    TokenResGitlabResponse
} from 'src/base_modules/integrations/github.types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { NonAuthEndpoint } from 'src/decorators/SkipAuthDecorator';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { TypedResponse } from 'src/types/apiResponses.types';
import {
    IntegrationInvalidToken,
    IntegrationTokenMissingPermissions,
    IntegrationTokenRetrievalFailed,
    AlreadyExists,
    FailedToAuthenticateSocialAccount
} from 'src/types/error.types';
import { GitlabIntegrationTokenService } from '../integrations/gitlab/gitlabToken.service';
import { AuthService } from './auth.service';

@Controller('auth/gitlab')
export class GitlabAuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
        private readonly gitlabIntegrationTokenService: GitlabIntegrationTokenService
    ) {}

    @ApiTags('Auth - Gitlab')
    @ApiOperation({ description: 'Start the gitlab authentication process.' })
    @NonAuthEndpoint()
    @Get('/authenticate')
    async githubAuthenticate(
        @Query() queryParams: Oauth2InitQuery,
        @Res() res: FastifyReply
    ): Promise<void> {
        const host = this.configService.get<string>('GITLAB_AUTH_HOST');
        const redirectUrl = new URL(`${host}/oauth/authorize`);
        redirectUrl.searchParams.append(
            'client_id',
            this.configService.getOrThrow<string>('GITLAB_AUTH_CLIENT_ID')
        );
        redirectUrl.searchParams.append(
            'redirect_uri',
            this.configService.getOrThrow<string>('GITLAB_AUTH_CALLBACK')
        );
        redirectUrl.searchParams.append('scope', 'api read_user');
        redirectUrl.searchParams.append('response_type', 'code');
        redirectUrl.searchParams.append('state', queryParams.state);

        res.status(302).redirect(redirectUrl.toString());
    }

    @ApiTags('Auth - Gitlab')
    @ApiOperation({ description: 'Finish the github authentication process.' })
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [IntegrationTokenMissingPermissions, IntegrationInvalidToken]
    })
    @ApiErrorDecorator({ statusCode: 409, errors: [AlreadyExists] })
    @ApiErrorDecorator({
        statusCode: 500,
        errors: [FailedToAuthenticateSocialAccount, IntegrationTokenRetrievalFailed]
    })
    @APIDocTypedResponseDecorator(TokenResponse)
    @NonAuthEndpoint()
    @Post('/finalize')
    async gitlabAuthFinalize(
        @Body() oauth2FinalizeBody: Oauth2FinalizeBody
    ): Promise<TypedResponse<TokenResponse>> {
        // (1) Exchange code for access token from gitlab store in db
        const token: TokenResGitlabResponse = await this.getToken(oauth2FinalizeBody.code);

        // (2) Validate access token permissions
        await this.gitlabIntegrationTokenService.validateOAuthAccessTokenPermissions(
            token.access_token,
            {}
        );

        // (3) Retrieve user info
        const user: GitlabUserResponse = await this.getUser(token.access_token);

        if (user.email === null || user.email === undefined) {
            throw new FailedToAuthenticateSocialAccount();
        }

        const authenticatedUser: GitlabAuthenticatedUser = {
            gitlab_user_id: user.id.toString(),
            email: user.email,
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            avatar_url: user.avatar_url
        };

        // (4) Register user if needed, otherwise sign in
        // (5) Return jwt token
        return { data: await this.authService.authenticateGitlabSocial(authenticatedUser) };
    }

    private async getToken(code: string): Promise<TokenResGitlabResponse> {
        try {
            const host = this.configService.get<string>('GITLAB_AUTH_HOST');
            const url = new URL(`${host}/oauth/token`);
            url.searchParams.append(
                'client_id',
                this.configService.getOrThrow<string>('GITLAB_AUTH_CLIENT_ID')
            );
            url.searchParams.append(
                'client_secret',
                this.configService.getOrThrow<string>('GITLAB_AUTH_CLIENT_SECRET')
            );
            url.searchParams.append('code', code);
            url.searchParams.append('grant_type', 'authorization_code');
            url.searchParams.append(
                'redirect_uri',
                this.configService.getOrThrow<string>('GITLAB_AUTH_CALLBACK')
            );
            const response = await axios.post(url.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json'
                }
            });

            const token = response.data as TokenResGitlabResponse;
            return token;
        } catch (err) {
            if (err instanceof AxiosError) {
                const axiosError: AxiosError = err;
                if (axiosError.response) {
                    if (axiosError.response.status === 401) {
                        throw new IntegrationInvalidToken();
                    }
                }
                throw new IntegrationTokenRetrievalFailed();
            }
            throw err;
        }
    }

    private async getUser(token: string): Promise<GitlabUserResponse> {
        try {
            const host = this.configService.get<string>('GITLAB_AUTH_HOST');
            const url = new URL(`${host}/api/v4/user`);

            const response = await axios.get(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const user = response.data as GitlabUserResponse;
            return user;
        } catch (err) {
            if (err instanceof AxiosError) {
                const axiosError: AxiosError = err;
                if (axiosError.response) {
                    if (axiosError.response.status === 401) {
                        throw new IntegrationTokenMissingPermissions();
                    }
                }
                throw new IntegrationInvalidToken();
            }
            throw err;
        }
    }
}
