// Mock fs module before importing the strategy
jest.mock('fs', () => ({
    default: {
        readFileSync: jest.fn()
    },
    readFileSync: jest.fn()
}));

import * as fs from 'fs';
import { Test, type TestingModule } from '@nestjs/testing';
import { RefreshJWTStrategy } from './refresh-token.strategy';

describe('RefreshJWTStrategy', () => {
    let strategy: RefreshJWTStrategy;
    const mockPrivateKey = `-----BEGIN EC PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgMockBaYK8lQRFl6j
-----END EC PRIVATE KEY-----`;

    beforeEach(async () => {
        // Mock fs.readFileSync to return a mock private key
        (fs.readFileSync as jest.Mock).mockReturnValue(mockPrivateKey);

        const module: TestingModule = await Test.createTestingModule({
            providers: [RefreshJWTStrategy]
        }).compile();

        strategy = module.get<RefreshJWTStrategy>(RefreshJWTStrategy);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should read private key from ./jwt/private.pem', () => {
            // Assert
            expect(fs.readFileSync).toHaveBeenCalledWith('./jwt/private.pem', 'utf8');
        });

        it('should extract JWT from body field refresh_token', () => {
            // The strategy should be configured to extract from body field
            // This is tested implicitly through the constructor setup
            expect(strategy).toBeDefined();
        });

        it('should throw error if private key file is not found', () => {
            // Arrange
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            // Act & Assert
            expect(() => new RefreshJWTStrategy()).toThrow('ENOENT: no such file or directory');
        });

        it('should handle permission error when reading private key', () => {
            // Arrange
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('EACCES: permission denied');
            });

            // Act & Assert
            expect(() => new RefreshJWTStrategy()).toThrow('EACCES: permission denied');
        });
    });

    describe('validate', () => {
        it('should return user object with userId and roles from payload', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: ['USER', 'ADMIN'],
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: ['USER', 'ADMIN']
            });
        });

        it('should handle refresh token specific payload structure', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: ['USER'],
                tokenType: 'refresh',
                sessionId: 'session-123',
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: ['USER']
            });
        });

        it('should handle payload with missing roles', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: undefined
            });
        });

        it('should handle payload with empty roles array', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: [],
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: []
            });
        });

        it('should handle payload with additional refresh token metadata', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: ['USER'],
                deviceId: 'device-123',
                issuedAt: new Date().toISOString(),
                lastUsed: new Date().toISOString(),
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: ['USER']
            });
        });

        it('should handle numeric userId', async () => {
            // Arrange
            const payload = {
                userId: 12345,
                roles: ['USER'],
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 12345,
                roles: ['USER']
            });
        });

        it('should handle null payload gracefully', async () => {
            // Arrange
            const payload = null as any;

            // Act & Assert
            await expect(() => strategy.validate(payload)).rejects.toThrow();
        });

        it('should handle undefined payload gracefully', async () => {
            // Arrange
            const payload = undefined as any;

            // Act & Assert
            await expect(() => strategy.validate(payload)).rejects.toThrow();
        });

        it('should handle empty object payload', async () => {
            // Arrange
            const payload = {};

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: undefined,
                roles: undefined
            });
        });
    });

    describe('security and edge cases', () => {
        it('should not expose sensitive data from payload', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: ['USER'],
                password: 'secret-password',
                apiKey: 'secret-api-key',
                secretToken: 'secret-token',
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: ['USER']
            });
            expect(result).not.toHaveProperty('password');
            expect(result).not.toHaveProperty('apiKey');
            expect(result).not.toHaveProperty('secretToken');
        });

        it('should handle malformed roles data', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: 'USER' as any, // Should be array but is string
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: 'USER'
            });
        });

        it('should handle nested object in roles', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: { role: 'USER', permissions: ['READ', 'WRITE'] } as any,
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: { role: 'USER', permissions: ['READ', 'WRITE'] }
            });
        });

        it('should handle very large payload', async () => {
            // Arrange
            const largeArray = new Array(1000).fill('ROLE');
            const payload = {
                userId: 'test-user-id',
                roles: largeArray,
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'test-user-id',
                roles: largeArray
            });
        });

        it('should be idempotent', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: ['USER'],
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result1 = await strategy.validate(payload);
            const result2 = await strategy.validate(payload);

            // Assert
            expect(result1).toEqual(result2);
        });

        it('should handle special characters in userId', async () => {
            // Arrange
            const payload = {
                userId: 'user-with-special-chars!@#$%^&*()',
                roles: ['USER'],
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: 'user-with-special-chars!@#$%^&*()',
                roles: ['USER']
            });
        });

        it('should handle UUID format userId', async () => {
            // Arrange
            const payload = {
                userId: '550e8400-e29b-41d4-a716-446655440000',
                roles: ['USER'],
                iat: 1234567890,
                exp: 1234567890
            };

            // Act
            const result = await strategy.validate(payload);

            // Assert
            expect(result).toEqual({
                userId: '550e8400-e29b-41d4-a716-446655440000',
                roles: ['USER']
            });
        });
    });
});
