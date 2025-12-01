import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import axios, { AxiosError } from 'axios';
import { FastifyReply } from 'fastify';
import {
    GithubAuthenticatedUser,
    Oauth2FinalizeBody,
    Oauth2InitQuery,
    TokenResponse
} from 'src/base_modules/auth/auth.types';
import {
    GithubEmail,
    GithubOAuthAccessTokenResponse,
    GithubUserResponse
} from 'src/base_modules/integrations/github/github.types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { NonAuthEndpoint } from 'src/decorators/SkipAuthDecorator';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { TypedResponse } from 'src/types/apiResponses.types';
import {
    AlreadyExists,
    IntegrationInvalidToken,
    IntegrationTokenMissingPermissions,
    IntegrationTokenRetrievalFailed,
    FailedToAuthenticateSocialAccount
} from 'src/types/error.types';
import { AuthService } from './auth.service';

@Controller('auth/github')
export class GithubAuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService
    ) {}

    @ApiTags('Auth - Github')
    @ApiOperation({ description: 'Start the github authentication process.' })
    @NonAuthEndpoint()
    @Get('/authenticate')
    async githubAuthenticate(
        @Query() queryParams: Oauth2InitQuery,
        @Res() res: FastifyReply
    ): Promise<void> {
        const redirectUrl = new URL('https://github.com/login/oauth/authorize');
        redirectUrl.searchParams.append(
            'client_id',
            this.configService.getOrThrow<string>('GITHUB_AUTH_CLIENT_ID')
        );
        redirectUrl.searchParams.append(
            'redirect_uri',
            this.configService.getOrThrow<string>('GITHUB_AUTH_CALLBACK')
        );
        // redirectUrl.searchParams.append('scope', 'user:email repo write:org');
        redirectUrl.searchParams.append('state', queryParams.state);

        res.status(302).redirect(redirectUrl.toString());
    }

    @ApiTags('Auth - Github')
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
    @NonAuthEndpoint()
    @APIDocTypedResponseDecorator(TokenResponse)
    @Post('/finalize')
    async githubAuthFinalize(
        @Body() oauth2FinalizeBody: Oauth2FinalizeBody
    ): Promise<TypedResponse<TokenResponse>> {
        // (1) Exchange code for access token from github store in db
        const token: GithubOAuthAccessTokenResponse = await this.getToken(oauth2FinalizeBody.code);

        // (2) Validate access token permissions
        // await this.githubIntegrationTokenService.validateOauthTokenPermissions(token.access_token, {
        //     additionalScopes: ['user:email']
        // });

        // (3) Retrieve user info
        const user: GithubUserResponse = await this.getUser(token.access_token);
        const email: string = await this.getPrimaryEmail(token.access_token);

        const authenticatedUser: GithubAuthenticatedUser = {
            github_user_id: user.id.toString(),
            email: email,
            access_token: token.access_token,
            refresh_token: undefined,
            avatar_url: user.avatar_url
        };

        // (4) Register user if needed, otherwise sign in
        // (5) Return jwt token
        return { data: await this.authService.authenticateGithubSocial(authenticatedUser) };
    }

    private async getToken(code: string): Promise<GithubOAuthAccessTokenResponse> {
        try {
            const url = new URL(`https://github.com/login/oauth/access_token`);
            const response = await axios.post(
                url.toString(),
                {
                    client_id: this.configService.getOrThrow<string>('GITHUB_AUTH_CLIENT_ID'),
                    client_secret: this.configService.getOrThrow<string>(
                        'GITHUB_AUTH_CLIENT_SECRET'
                    ),
                    code: code
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    }
                }
            );

            const token = response.data as GithubOAuthAccessTokenResponse;
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

    private async getUser(token: string): Promise<GithubUserResponse> {
        try {
            const url = new URL(`https://api.github.com/user`);

            const response = await axios.get(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            const user = response.data as GithubUserResponse;
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

    private async getPrimaryEmail(token: string): Promise<string> {
        try {
            const url = new URL(`https://api.github.com/user/emails`);

            const response = await axios.get(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            const emails = response.data as GithubEmail[];

            for (const email of emails) {
                if (email.primary) {
                    return email.email;
                }
            }

            if (emails.length > 0) {
                return emails[0]!.email;
            }

            throw new Error('No email');
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
