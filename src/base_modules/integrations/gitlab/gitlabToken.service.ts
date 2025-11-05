import { Injectable } from '@nestjs/common';
import { GitlabIntegration } from 'src/base_modules/integrations/gitlab/gitlabIntegration.types';
import { User } from 'src/base_modules/users/users.entity';

@Injectable()
export class GitlabIntegrationTokenService {
    /**
     * Validates that a given gitlab personal access token has the necessary scopes/permissions to perform the necessary actions withing the API
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param token The personal access token
     * @param gitlabInstanceUrl The host of the gitlab server (ex: https://gitlab.uni.lu)
     * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
     * @returns
     */
    async validatePersonalAccessTokenPermissions(
        token: string,
        gitlabInstanceUrl: string,
        { additionalScopes = [] }: { additionalScopes?: string[] }
    ): Promise<void> {
        const requiredScopes = ['read_repository', 'read_user', 'read_api', 'self_rotate'];
        const allScopes = [...requiredScopes, ...additionalScopes];

        try {
            const response = await fetch(
                `${gitlabInstanceUrl}/api/v4/personal_access_tokens/self`,
                {
                    headers: {
                        'PRIVATE-TOKEN': token
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid or revoked token');
                }
                throw new Error(`Failed to fetch user information: ${response.status}`);
            }

            const tokenInfo = (await response.json()) as { scopes?: string[] };

            // Check if the token has the required scopes
            if (!tokenInfo) {
                throw new Error('Token does not have the required permissions.');
            }

            const hasAllScopes = allScopes.every((scope) => tokenInfo.scopes?.includes(scope));

            if (!hasAllScopes) {
                throw new Error('Token does not have the required permissions.');
            }
        } catch (error) {
            if (error instanceof Error && ((error) as Error).message.includes('401')) {
                throw new Error('Invalid or revoked token');
            }
            throw new Error(`Failed to validate token: ${(error as Error).message}`);
        }
    }

    /**
     * Retrieves the expiry date of a personal access token from the provider
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param token The personal access token
     * @param gitlabInstanceUrl The host of the gitlab server (ex: https://gitlab.uni.lu)
     * @returns (1) a boolean indicating whether it has an expiry data at all (2) the expiry date (if any)
     */
    async getPersonalAccessTokenExpiryRemote(
        token: string,
        gitlabInstanceUrl: string
    ): Promise<[boolean, Date | undefined]> {
        try {
            const response = await fetch(`${gitlabInstanceUrl}/api/v4/admin/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'PRIVATE-TOKEN': token
                },
                body: JSON.stringify({ token: token })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid or revoked token');
                }
                throw new Error(`Failed to fetch access token info. Status: ${response.status}`);
            }

            const data = (await response.json()) as { expires_at?: string };

            if (data && data.expires_at) {
                const expiryDate = new Date(data.expires_at);
                return [true, expiryDate];
            }

            return [false, undefined]; // Token does not have an expiry date
        } catch (error) {
            console.error('Error fetching access token expiry:', error);
            if (error instanceof Error && ((error) as Error).message.includes('Invalid or revoked token')) {
                throw error;
            }
            if (
                error instanceof Error &&
                error.message.includes('Failed to fetch access token info')
            ) {
                throw error;
            }
            throw new Error('Failed to retrieve access token expiry');
        }
    }

    /**
     * Retrieves the expiry date of a oauth token from the provider
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @returns (1) a boolean indicating whether it has an expiry data at all (2) the expiry date (if any)
     * @param token The oauth token
     */
    async getOAuthTokenExpiryRemote(_token: string): Promise<[boolean, Date | undefined]> {
        throw new Error('Method not implemented.');
    }

    /**
     * Validates that a given gitlab oauth access token has the necessary scopes/permissions to perform the necessary actions withing the API
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param token The personal access token
     * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
     * @returns
     */
    async validateOAuthAccessTokenPermissions(
        _token: string,
        { additionalScopes: _additionalScopes = [] }: { additionalScopes?: string[] }
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Refresh the gitlab oauth token and update the database
     * @throws {IntegrationTokenRefreshFailed} In case it could not be refreshed
     *
     * @param refreshToken The refresh token
     * @returns the new integration
     */
    async refreshOAuthToken(
        _refreshToken: string,
        _integrationId: string
    ): Promise<GitlabIntegration> {
        throw new Error('Method not implemented.');
    }

    /**
     * Update a gitlab-social connected user's account oauth token from signin
     * @throws {EntityNotFound} If the integration could not be found
     *
     * @param user The user
     * @param newAccessToken The new access token
     * @param newRefreshToken The new refresh token
     */
    async updateOAuthTokenFromSignIn(
        _user: User,
        _newAccessToken: string,
        _newRefreshToken: string
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
