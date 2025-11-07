import { Test, type TestingModule } from '@nestjs/testing';
import {
    IntegrationInvalidToken,
    IntegrationTokenExpired,
    IntegrationTokenMissingPermissions,
    IntegrationTokenRetrievalFailed
} from '../../../types/error.types';
import { GithubIntegrationTokenService } from './githubToken.service';

// Mock dynamic import of octokit
jest.mock('octokit', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        request: jest.fn()
    }))
}));

describe('GithubIntegrationTokenService', () => {
    let service: GithubIntegrationTokenService;
    let mockOctokit: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [GithubIntegrationTokenService]
        }).compile();

        service = module.get<GithubIntegrationTokenService>(GithubIntegrationTokenService);

        // Setup octokit mock
        const octokitModule = await import('octokit');
        const { Octokit } = octokitModule;
        mockOctokit = {
            request: jest.fn()
        };
        (Octokit as any).mockImplementation(() => mockOctokit);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('validateOauthTokenPermissions', () => {
        it('should delegate to validateTokenPermissions', async () => {
            const validateTokenPermissionsSpy = jest
                .spyOn(service as any, 'validateTokenPermissions')
                .mockResolvedValue(undefined);
            const token = 'gho_oauth_token';
            const additionalScopes = ['repo'];

            await service.validateOauthTokenPermissions(token, { additionalScopes });

            expect(validateTokenPermissionsSpy).toHaveBeenCalledWith(token, { additionalScopes });
        });

        it('should use empty array as default for additionalScopes', async () => {
            const validateTokenPermissionsSpy = jest
                .spyOn(service as any, 'validateTokenPermissions')
                .mockResolvedValue(undefined);
            const token = 'gho_oauth_token';

            await service.validateOauthTokenPermissions(token, {});

            expect(validateTokenPermissionsSpy).toHaveBeenCalledWith(token, {
                additionalScopes: []
            });
        });
    });

    describe('validateClassicTokenPermissions', () => {
        it('should delegate to validateTokenPermissions', async () => {
            const validateTokenPermissionsSpy = jest
                .spyOn(service as any, 'validateTokenPermissions')
                .mockResolvedValue(undefined);
            const token = 'ghp_classic_token';
            const additionalScopes = ['write:org'];

            await service.validateClassicTokenPermissions(token, { additionalScopes });

            expect(validateTokenPermissionsSpy).toHaveBeenCalledWith(token, { additionalScopes });
        });

        it('should use empty array as default for additionalScopes', async () => {
            const validateTokenPermissionsSpy = jest
                .spyOn(service as any, 'validateTokenPermissions')
                .mockResolvedValue(undefined);
            const token = 'ghp_classic_token';

            await service.validateClassicTokenPermissions(token, {});

            expect(validateTokenPermissionsSpy).toHaveBeenCalledWith(token, {
                additionalScopes: []
            });
        });
    });

    describe('validateTokenPermissions', () => {
        it('should successfully validate token with public_repo scope', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'x-oauth-scopes': 'public_repo, user'
                }
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: []
                })
            ).resolves.toBeUndefined();

            expect(mockOctokit.request).toHaveBeenCalledWith('HEAD /');
        });

        it('should successfully validate token with repo scope (covers public_repo)', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'x-oauth-scopes': 'repo, user'
                }
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: []
                })
            ).resolves.toBeUndefined();
        });

        it('should successfully validate token with additional scopes', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'x-oauth-scopes': 'public_repo, write:org, user'
                }
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: ['write:org']
                })
            ).resolves.toBeUndefined();
        });

        it('should throw IntegrationTokenMissingPermissions when x-oauth-scopes header is missing', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {}
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: []
                })
            ).rejects.toThrow(IntegrationTokenMissingPermissions);
        });

        it('should throw IntegrationTokenMissingPermissions when required scope is missing', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'x-oauth-scopes': 'user'
                }
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: []
                })
            ).rejects.toThrow(IntegrationTokenMissingPermissions);
        });

        it('should throw IntegrationTokenMissingPermissions when additional scope is missing', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'x-oauth-scopes': 'public_repo, user'
                }
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: ['write:org']
                })
            ).rejects.toThrow(IntegrationTokenMissingPermissions);
        });

        it('should throw IntegrationInvalidToken for 401 status', async () => {
            const error = { status: 401 };
            mockOctokit.request.mockRejectedValue(error);

            await expect(
                (service as any).validateTokenPermissions('ghp_invalid_token', {
                    additionalScopes: []
                })
            ).rejects.toThrow(IntegrationInvalidToken);
        });

        it('should throw IntegrationTokenRetrievalFailed for other errors', async () => {
            const error = new Error('Network error');
            mockOctokit.request.mockRejectedValue(error);

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: []
                })
            ).rejects.toThrow(IntegrationTokenRetrievalFailed);
        });

        it('should re-throw IntegrationTokenMissingPermissions', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'x-oauth-scopes': 'user'
                }
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: []
                })
            ).rejects.toThrow(IntegrationTokenMissingPermissions);
        });

        it('should handle scopes with whitespace correctly', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'x-oauth-scopes': ' public_repo , user , write:org '
                }
            });

            await expect(
                (service as any).validateTokenPermissions('ghp_test_token', {
                    additionalScopes: ['write:org']
                })
            ).resolves.toBeUndefined();
        });
    });

    describe('getClassicTokenExpiryRemote', () => {
        it('should return false and undefined when no expiry header is present', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {}
            });

            const result = await service.getClassicTokenExpiryRemote('ghp_test_token');

            expect(result).toEqual([false, undefined]);
            expect(mockOctokit.request).toHaveBeenCalledWith('HEAD /');
        });

        it('should return true and expiry date when expiry header is a string', async () => {
            const futureDate = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'github-authentication-token-expiration': futureDate
                }
            });

            const result = await service.getClassicTokenExpiryRemote('ghp_test_token');

            expect(result[0]).toBe(true);
            expect(result[1]).toEqual(new Date(Date.parse(futureDate)));
        });

        it('should return true and expiry date when expiry header is a number', async () => {
            const expiryTimestamp = Date.now() + 86400000; // 1 day from now
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'github-authentication-token-expiration': expiryTimestamp
                }
            });

            const result = await service.getClassicTokenExpiryRemote('ghp_test_token');

            expect(result[0]).toBe(true);
            expect(result[1]).toEqual(new Date(expiryTimestamp));
        });

        it('should throw IntegrationTokenExpired when token is already expired', async () => {
            const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'github-authentication-token-expiration': expiredDate
                }
            });

            await expect(service.getClassicTokenExpiryRemote('ghp_expired_token')).rejects.toThrow(
                IntegrationTokenExpired
            );
        });

        it('should throw IntegrationInvalidToken for bad credentials message', async () => {
            const error = { message: 'Bad credentials' };
            mockOctokit.request.mockRejectedValue(error);

            await expect(service.getClassicTokenExpiryRemote('ghp_invalid_token')).rejects.toThrow(
                IntegrationInvalidToken
            );
        });

        it('should throw IntegrationInvalidToken for 401 status', async () => {
            const error = { status: 401 };
            mockOctokit.request.mockRejectedValue(error);

            await expect(service.getClassicTokenExpiryRemote('ghp_invalid_token')).rejects.toThrow(
                IntegrationInvalidToken
            );
        });

        it('should throw IntegrationTokenRetrievalFailed for other errors', async () => {
            const error = new Error('Network error');
            mockOctokit.request.mockRejectedValue(error);

            await expect(service.getClassicTokenExpiryRemote('ghp_test_token')).rejects.toThrow(
                IntegrationTokenRetrievalFailed
            );
        });

        it('should re-throw IntegrationTokenExpired', async () => {
            const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'github-authentication-token-expiration': expiredDate
                }
            });

            await expect(service.getClassicTokenExpiryRemote('ghp_expired_token')).rejects.toThrow(
                IntegrationTokenExpired
            );
        });

        it('should handle case insensitive bad credentials message', async () => {
            const error = { message: 'BAD CREDENTIALS' };
            mockOctokit.request.mockRejectedValue(error);

            await expect(service.getClassicTokenExpiryRemote('ghp_invalid_token')).rejects.toThrow(
                IntegrationInvalidToken
            );
        });

        it('should return false when expiry header cannot be parsed as date', async () => {
            mockOctokit.request.mockResolvedValue({
                headers: {
                    'github-authentication-token-expiration': 'invalid-date'
                }
            });

            const result = await service.getClassicTokenExpiryRemote('ghp_test_token');

            // The service returns [true, Date(NaN)] for invalid dates
            expect(result[0]).toBe(true);
            expect(isNaN(result[1]?.getTime() ?? 0)).toBe(true);
        });
    });
});
