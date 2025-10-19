// Mock fs module before importing the strategy
jest.mock('fs', () => ({
    default: {
        readFileSync: jest.fn()
    },
    readFileSync: jest.fn()
}));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import * as fs from 'fs';

describe('JwtStrategy', () => {
    let strategy: JwtStrategy;
    const mockPrivateKey = `-----BEGIN EC PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgMockBaYK8lQRFl6j
-----END EC PRIVATE KEY-----`;

    beforeEach(async () => {
        // Mock fs.readFileSync to return a mock private key
        (fs.readFileSync as jest.Mock).mockReturnValue(mockPrivateKey);

        const module: TestingModule = await Test.createTestingModule({
            providers: [JwtStrategy]
        }).compile();

        strategy = module.get<JwtStrategy>(JwtStrategy);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should read private key from ./jwt/private.pem', () => {
            // Assert
            expect(fs.readFileSync).toHaveBeenCalledWith('./jwt/private.pem', 'utf8');
        });

        it('should throw error if private key file is not found', () => {
            // Arrange
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            // Act & Assert
            expect(() => new JwtStrategy()).toThrow('ENOENT: no such file or directory');
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

        it('should handle payload with additional properties', async () => {
            // Arrange
            const payload = {
                userId: 'test-user-id',
                roles: ['USER'],
                email: 'test@example.com',
                name: 'Test User',
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
    });
});
