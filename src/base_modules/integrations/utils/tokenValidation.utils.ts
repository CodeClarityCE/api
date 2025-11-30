import { IntegrationTokenExpired } from 'src/types/error.types';

/**
 * Parse token expiry from various formats
 * @param expiryValue - String, number, or undefined expiry value
 * @returns Parsed Date or undefined
 */
export function parseTokenExpiry(
    expiryValue: string | number | undefined
): Date | undefined {
    if (!expiryValue) return undefined;

    if (typeof expiryValue === 'string') {
        return new Date(Date.parse(expiryValue));
    } else if (typeof expiryValue === 'number') {
        return new Date(expiryValue);
    }

    return undefined;
}

/**
 * Check if a token has expired
 * @param expiryDate - Token expiry date
 * @returns true if expired, false otherwise
 */
export function isTokenExpired(expiryDate: Date): boolean {
    const now = new Date().getTime();
    const expiry = expiryDate.getTime();
    return now >= expiry;
}

/**
 * Validate token expiry and throw if expired
 * @throws {IntegrationTokenExpired} if token is expired
 */
export function validateNotExpired(expiryDate: Date | undefined): void {
    if (expiryDate && isTokenExpired(expiryDate)) {
        throw new IntegrationTokenExpired();
    }
}

/**
 * Check if token has required scopes (strict checking)
 * @param tokenScopes - Scopes the token has
 * @param requiredScopes - Scopes required
 * @returns true if all required scopes present
 */
export function hasRequiredScopes(
    tokenScopes: string[],
    requiredScopes: string[]
): boolean {
    const scopeSet = new Set(tokenScopes);
    return requiredScopes.every((scope) => scopeSet.has(scope));
}
