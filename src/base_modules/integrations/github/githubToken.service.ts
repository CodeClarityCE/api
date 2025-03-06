import { Injectable } from '@nestjs/common';
import {
    IntegrationInvalidToken,
    IntegrationTokenExpired,
    IntegrationTokenMissingPermissions,
    IntegrationTokenRetrievalFailed
} from 'src/types/error.types';

@Injectable()
export class GithubIntegrationTokenService {
    constructor() {}

    /**
     * Validates that a given github oauth token has the necessary scopes/permissions to perform the necessary actions withing the API
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param token The oauth access token
     * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
     * @returns
     */
    async validateOauthTokenPermissions(
        token: string,
        { additionalScopes = [] }: { additionalScopes?: string[] }
    ): Promise<void> {
        return await this.validateTokenPermissions(token, { additionalScopes: additionalScopes });
    }

    /**
     * Validates that a given github classic token has the necessary scopes/permissions to perform the necessary actions withing the API
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param token The classic access token
     * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
     * @returns
     */
    async validateClassicTokenPermissions(
        token: string,
        { additionalScopes = [] }: { additionalScopes?: string[] }
    ): Promise<void> {
        return await this.validateTokenPermissions(token, { additionalScopes: additionalScopes });
    }

    /**
     * Validates that a given github token has the necessary scopes/permissions to perform the necessary actions withing the API
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param token The personal access token
     * @param additionalScopes We check the basic scopes needed for common actions. Any additional scopes can be defined here.
     * @returns
     */
    private async validateTokenPermissions(
        token: string,
        { additionalScopes = [] }: { additionalScopes?: string[] }
    ): Promise<void> {
        try {
            const { Octokit } = await import('octokit');
            const octokit = new Octokit({
                auth: token
            });

            const { headers } = await octokit.request('HEAD /');
            const headersString: string | undefined = headers['x-oauth-scopes'];

            if (!headersString) {
                throw new IntegrationTokenMissingPermissions();
            }

            const scopes = new Set(headersString.split(',').map((scope) => scope.trim()));
            // const necessaryScopes = new Set(['repo', 'write:org']);
            const necessaryScopes = new Set(['public_repo']);
            for (const additionalScope of additionalScopes) {
                necessaryScopes.add(additionalScope);
            }

            for (const necessaryScope of necessaryScopes) {
                if (necessaryScope == 'public_repo') {
                    if (scopes.has('repo')) {
                        continue;
                    }
                }
                if (!scopes.has(necessaryScope)) {
                    throw new IntegrationTokenMissingPermissions();
                }
            }

            return;
        } catch (err) {
            if (err instanceof IntegrationTokenMissingPermissions) {
                throw err;
            }

            if (err.status) {
                if (err.status == 401) {
                    throw new IntegrationInvalidToken();
                }
            }

            throw new IntegrationTokenRetrievalFailed();
        }
    }

    /**
     * Retrieves the expiry date of a personal access token from the provider
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param token The personal access token
     * @returns (1) a boolean indicating whether it has an expiry data at all (2) the expiry date (if any)
     */
    async getClassicTokenExpiryRemote(token: string): Promise<[boolean, Date | undefined]> {
        try {
            const { Octokit } = await import('octokit');
            const octokit = new Octokit({
                auth: token
            });

            const { headers } = await octokit.request('HEAD /');
            const tokenExpiry: string | number | undefined =
                headers['github-authentication-token-expiration'];

            if (tokenExpiry) {
                let date: Date | undefined = undefined;
                if (typeof tokenExpiry == 'string') {
                    date = new Date(Date.parse(tokenExpiry));
                } else if (typeof tokenExpiry == 'number') {
                    date = new Date(tokenExpiry);
                }

                if (date) {
                    const timeServer = new Date().getTime();
                    const timeGitlab = date.getTime();

                    const alreadyExpired = timeServer >= timeGitlab;
                    if (alreadyExpired) {
                        throw new IntegrationTokenExpired();
                    }
                    return [true, date];
                }
            }

            return [false, undefined];
        } catch (err) {
            if (err instanceof IntegrationTokenExpired) {
                throw err;
            }

            if (err.message) {
                if (err.message.toLowerCase().includes('bad credentials')) {
                    throw new IntegrationInvalidToken();
                }
            }

            if (err.status) {
                if (err.status == 401) {
                    throw new IntegrationInvalidToken();
                }
            }

            throw new IntegrationTokenRetrievalFailed();
        }
    }
}
