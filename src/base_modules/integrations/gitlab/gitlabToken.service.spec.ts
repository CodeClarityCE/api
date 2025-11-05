import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { User } from '../../users/users.entity';

import { GitlabIntegrationTokenService } from './gitlabToken.service';

// Mock fetch globally
global.fetch = jest.fn();

describe('GitlabIntegrationTokenService', () => {
    let service: GitlabIntegrationTokenService;

    const mockUser: User = {
        id: 'test-user-id',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        activated: true,
        registration_verified: true,
        password: 'hashed-password',
        created_on: new Date(),
        integrations: [],
        analyses: []
    } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [GitlabIntegrationTokenService]
        }).compile();

        service = module.get<GitlabIntegrationTokenService>(GitlabIntegrationTokenService);

        // Reset mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('validatePersonalAccessTokenPermissions', () => {
        const testToken = 'glpat-test-token';
        const testGitlabInstanceUrl = 'https://gitlab.com';

        it('should successfully validate token with required permissions', async () => {
            const mockTokenInfo = {
                scopes: ['read_repository', 'read_user', 'read_api', 'self_rotate']
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenInfo)
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).resolves.not.toThrow();

            expect(fetch).toHaveBeenCalledWith(
                `${testGitlabInstanceUrl}/api/v4/personal_access_tokens/self`,
                {
                    headers: {
                        'PRIVATE-TOKEN': testToken
                    }
                }
            );
        });

        it('should successfully validate token with additional scopes', async () => {
            const mockTokenInfo = {
                scopes: [
                    'read_repository',
                    'read_user',
                    'read_api',
                    'self_rotate',
                    'write_repository'
                ]
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenInfo)
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {
                    additionalScopes: ['write_repository']
                })
            ).resolves.not.toThrow();
        });

        it('should throw error when token is invalid (401)', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 401
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Invalid or revoked token');
        });

        it('should throw error when API request fails with non-401 status', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Failed to fetch user information: 500');
        });

        it('should throw error when token info is null', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(null)
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Token does not have the required permissions.');
        });

        it('should throw error when token lacks required scopes', async () => {
            const mockTokenInfo = {
                scopes: ['read_repository', 'read_user'] // Missing read_api and self_rotate
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenInfo)
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Token does not have the required permissions.');
        });

        it('should throw error when token lacks additional scopes', async () => {
            const mockTokenInfo = {
                scopes: ['read_repository', 'read_user', 'read_api', 'self_rotate']
                // Missing write_repository
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenInfo)
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {
                    additionalScopes: ['write_repository']
                })
            ).rejects.toThrow('Token does not have the required permissions.');
        });

        it('should throw error when token has no scopes property', async () => {
            const mockTokenInfo = {
                id: 123,
                name: 'Test Token'
                // Missing scopes property
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenInfo)
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Token does not have the required permissions.');
        });

        it('should handle network errors', async () => {
            (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Failed to validate token: Network error');
        });

        it('should handle JSON parsing errors', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockRejectedValue(new Error('JSON parsing error'))
            });

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Failed to validate token: JSON parsing error');
        });

        it('should handle 401 errors from fetch exceptions', async () => {
            (fetch as jest.Mock).mockRejectedValue(new Error('Fetch failed with 401'));

            await expect(
                service.validatePersonalAccessTokenPermissions(testToken, testGitlabInstanceUrl, {})
            ).rejects.toThrow('Invalid or revoked token');
        });
    });

    describe('getPersonalAccessTokenExpiryRemote', () => {
        const testToken = 'glpat-test-token';
        const testGitlabInstanceUrl = 'https://gitlab.com';

        it('should successfully retrieve token expiry date', async () => {
            const expiryDate = '2024-12-31T23:59:59.000Z';
            const mockTokenData = {
                expires_at: expiryDate
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenData)
            });

            const result = await service.getPersonalAccessTokenExpiryRemote(
                testToken,
                testGitlabInstanceUrl
            );

            expect(result).toEqual([true, new Date(expiryDate)]);
            expect(fetch).toHaveBeenCalledWith(`${testGitlabInstanceUrl}/api/v4/admin/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'PRIVATE-TOKEN': testToken
                },
                body: JSON.stringify({ token: testToken })
            });
        });

        it('should return false when token has no expiry date', async () => {
            const mockTokenData = {
                id: 123,
                name: 'Test Token'
                // No expires_at property
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenData)
            });

            const result = await service.getPersonalAccessTokenExpiryRemote(
                testToken,
                testGitlabInstanceUrl
            );

            expect(result).toEqual([false, undefined]);
        });

        it('should return false when token data is null', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(null)
            });

            const result = await service.getPersonalAccessTokenExpiryRemote(
                testToken,
                testGitlabInstanceUrl
            );

            expect(result).toEqual([false, undefined]);
        });

        it('should throw error when token is invalid (401)', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 401
            });

            await expect(
                service.getPersonalAccessTokenExpiryRemote(testToken, testGitlabInstanceUrl)
            ).rejects.toThrow('Invalid or revoked token');
        });

        it('should throw error when API request fails with non-401 status', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 403
            });

            await expect(
                service.getPersonalAccessTokenExpiryRemote(testToken, testGitlabInstanceUrl)
            ).rejects.toThrow('Failed to fetch access token info. Status: 403');
        });

        it('should handle network errors', async () => {
            (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(
                service.getPersonalAccessTokenExpiryRemote(testToken, testGitlabInstanceUrl)
            ).rejects.toThrow('Failed to retrieve access token expiry');
        });

        it('should handle JSON parsing errors', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockRejectedValue(new Error('JSON parsing error'))
            });

            await expect(
                service.getPersonalAccessTokenExpiryRemote(testToken, testGitlabInstanceUrl)
            ).rejects.toThrow('Failed to retrieve access token expiry');
        });

        it('should handle expires_at with null value', async () => {
            const mockTokenData = {
                id: 123,
                name: 'Test Token',
                expires_at: null
            };

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockTokenData)
            });

            const result = await service.getPersonalAccessTokenExpiryRemote(
                testToken,
                testGitlabInstanceUrl
            );

            expect(result).toEqual([false, undefined]);
        });
    });

    describe('getOAuthTokenExpiryRemote', () => {
        it('should throw Error for unimplemented method', async () => {
            await expect(service.getOAuthTokenExpiryRemote('test-token')).rejects.toThrow(
                'Method not implemented.'
            );
        });
    });

    describe('validateOAuthAccessTokenPermissions', () => {
        it('should throw Error for unimplemented method', async () => {
            await expect(
                service.validateOAuthAccessTokenPermissions('test-token', {})
            ).rejects.toThrow('Method not implemented.');
        });
    });

    describe('refreshOAuthToken', () => {
        it('should throw Error for unimplemented method', async () => {
            await expect(
                service.refreshOAuthToken('refresh-token', 'integration-id')
            ).rejects.toThrow('Method not implemented.');
        });
    });

    describe('updateOAuthTokenFromSignIn', () => {
        it('should throw Error for unimplemented method', async () => {
            await expect(
                service.updateOAuthTokenFromSignIn(
                    mockUser,
                    'new-access-token',
                    'new-refresh-token'
                )
            ).rejects.toThrow('Method not implemented.');
        });
    });
});
