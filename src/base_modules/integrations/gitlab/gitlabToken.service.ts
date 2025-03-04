import { Injectable } from '@nestjs/common';
import { GitlabIntegration } from 'src/types/entities/frontend/GitlabIntegration';
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
        throw new Error('Method not implemented.');
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
        throw new Error('Method not implemented.');
    }

    /**
     * Retrieves the expiry date of a oauth token from the provider
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @returns (1) a boolean indicating whether it has an expiry data at all (2) the expiry date (if any)
     * @param token The oauth token
     */
    async getOAuthTokenExpiryRemote(token: string): Promise<[boolean, Date | undefined]> {
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
        token: string,
        { additionalScopes = [] }: { additionalScopes?: string[] }
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
        refreshToken: string,
        integrationId: string
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
        user: User,
        newAccessToken: string,
        newRefreshToken: string
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
