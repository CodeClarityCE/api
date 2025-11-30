import {
    IntegrationInvalidToken,
    IntegrationTokenExpired,
    IntegrationTokenMissingPermissions,
    IntegrationTokenRetrievalFailed
} from 'src/types/error.types';

/**
 * Base class for VCS token validation services
 * Provides common logic for GitHub, GitLab, and future VCS providers
 */
export abstract class BaseVCSTokenService {
    /**
     * Validate token permissions - to be implemented by subclasses
     * @param token - Access token to validate
     * @param requiredScopes - Scopes required for this operation
     * @param options - Provider-specific options (e.g., gitlabInstanceUrl)
     * @throws {IntegrationTokenMissingPermissions}
     * @throws {IntegrationInvalidToken}
     * @throws {IntegrationTokenRetrievalFailed}
     */
    protected abstract validateTokenScopes(
        token: string,
        requiredScopes: string[],
        options?: Record<string, unknown>
    ): Promise<void>;

    /**
     * Fetch token expiry from provider - to be implemented by subclasses
     * @param token - Access token
     * @param options - Provider-specific options
     * @returns Tuple of [hasExpiry, expiryDate]
     * @throws {IntegrationInvalidToken}
     * @throws {IntegrationTokenRetrievalFailed}
     */
    protected abstract fetchTokenExpiry(
        token: string,
        options?: Record<string, unknown>
    ): Promise<[boolean, Date | undefined]>;

    /**
     * Common error handling for HTTP responses
     * @param error - Caught error
     * @throws Appropriate integration error
     */
    protected handleTokenError(error: unknown): never {
        // Re-throw known errors
        if (
            error instanceof IntegrationTokenMissingPermissions ||
            error instanceof IntegrationTokenExpired ||
            error instanceof IntegrationInvalidToken
        ) {
            throw error;
        }

        // Safely handle null/undefined
        if (error === null || error === undefined) {
            throw new IntegrationTokenRetrievalFailed();
        }

        // Handle HTTP 401 errors (supports both axios and direct error formats)
        const errorObj = error as {
            status?: number;
            statusCode?: number;
            message?: string;
            response?: { status?: number };
        };
        if (
            errorObj.status === 401 ||
            errorObj.statusCode === 401 ||
            errorObj.response?.status === 401
        ) {
            throw new IntegrationInvalidToken();
        }

        // Handle "bad credentials" messages
        if (errorObj.message?.toLowerCase().includes('bad credentials')) {
            throw new IntegrationInvalidToken();
        }

        if (errorObj.message?.toLowerCase().includes('invalid or revoked token')) {
            throw new IntegrationInvalidToken();
        }

        // Generic failure
        throw new IntegrationTokenRetrievalFailed();
    }

    /**
     * Get default required scopes for the provider
     * Override in subclass if needed
     */
    protected abstract getDefaultScopes(): string[];

    /**
     * Validate token has required permissions
     * Common wrapper that adds error handling
     */
    async validatePermissions(
        token: string,
        options?: { additionalScopes?: string[]; [key: string]: unknown }
    ): Promise<void> {
        try {
            const { additionalScopes = [], ...otherOptions } = options || {};
            const requiredScopes = [...this.getDefaultScopes(), ...additionalScopes];

            await this.validateTokenScopes(token, requiredScopes, otherOptions);
        } catch (error) {
            this.handleTokenError(error);
        }
    }

    /**
     * Get token expiry with common error handling
     */
    async getTokenExpiry(
        token: string,
        options?: Record<string, unknown>
    ): Promise<[boolean, Date | undefined]> {
        try {
            return await this.fetchTokenExpiry(token, options);
        } catch (error) {
            this.handleTokenError(error);
        }
    }
}
