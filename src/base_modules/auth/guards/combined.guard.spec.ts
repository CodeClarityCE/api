// Mock fs module before importing the guard
jest.mock('fs', () => ({
    default: {
        readFileSync: jest.fn()
    },
    readFileSync: jest.fn()
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CombinedAuthGuard } from './combined.guard';
import { SKIP_AUTH_KEY } from 'src/decorators/SkipAuthDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { NotAuthenticated, AccountNotActivated } from 'src/types/error.types';
import { JWTPayload } from './jwt.types';
import { Request } from 'express';
import { Socket } from 'socket.io';
import * as fs from 'fs';

describe('CombinedAuthGuard', () => {
    let guard: CombinedAuthGuard;
    let jwtService: jest.Mocked<JwtService>;
    let reflector: jest.Mocked<Reflector>;
    let mockExecutionContext: jest.Mocked<ExecutionContext>;
    let mockRequest: Partial<Request>;
    let mockSocket: Partial<Socket>;

    const mockPrivateKey = 'mock-private-key';
    const mockJwtPayload: JWTPayload = {
        userId: 'user-123',
        roles: ['USER'],
        activated: true
    };

    beforeEach(async () => {
        // Setup fs mock before module compilation
        (fs.readFileSync as jest.Mock).mockReturnValue(mockPrivateKey);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CombinedAuthGuard,
                {
                    provide: JwtService,
                    useValue: {
                        verifyAsync: jest.fn()
                    }
                },
                {
                    provide: Reflector,
                    useValue: {
                        getAllAndOverride: jest.fn()
                    }
                }
            ]
        }).compile();

        guard = module.get<CombinedAuthGuard>(CombinedAuthGuard);
        jwtService = module.get(JwtService);
        reflector = module.get(Reflector);

        // Setup mock execution context
        mockRequest = {
            headers: {},
            user: undefined
        };

        mockSocket = {
            handshake: {
                headers: {},
                time: new Date().toISOString(),
                address: '127.0.0.1',
                xdomain: false,
                secure: false,
                issued: Date.now(),
                url: '/',
                query: {},
                auth: {}
            },
            data: {}
        };

        mockExecutionContext = {
            getHandler: jest.fn(),
            getClass: jest.fn(),
            getType: jest.fn(),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: () => mockRequest
            }),
            switchToWs: jest.fn().mockReturnValue({
                getClient: () => mockSocket
            })
        } as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should read public key from file system', () => {
            expect(fs.readFileSync).toHaveBeenCalled();
            expect(guard.publicKey).toBe(mockPrivateKey);
        });

        it('should set ES512 algorithm', () => {
            expect(guard.algorithms).toEqual(['ES512']);
        });
    });

    describe('canActivate', () => {
        describe('public endpoints', () => {
            it('should allow access to non-auth endpoints', async () => {
                reflector.getAllAndOverride.mockReturnValue(true);

                const result = await guard.canActivate(mockExecutionContext);

                expect(result).toBe(true);
                expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_AUTH_KEY, [
                    mockExecutionContext.getHandler(),
                    mockExecutionContext.getClass()
                ]);
            });
        });

        describe('HTTP context', () => {
            beforeEach(() => {
                mockExecutionContext.getType.mockReturnValue('http');
                reflector.getAllAndOverride.mockReturnValue(false);
            });

            it('should throw NotAuthenticated when no auth headers provided', async () => {
                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    NotAuthenticated
                );
            });

            it('should authenticate with valid JWT token', async () => {
                const token = 'valid-jwt-token';
                mockRequest.headers!.authorization = `Bearer ${token}`;
                jwtService.verifyAsync.mockResolvedValue(mockJwtPayload);

                const result = await guard.canActivate(mockExecutionContext);

                expect(result).toBe(true);
                expect(jwtService.verifyAsync).toHaveBeenCalledWith(token, {
                    secret: mockPrivateKey,
                    algorithms: ['ES512']
                });
                expect(mockRequest.user).toBeInstanceOf(AuthenticatedUser);
                expect((mockRequest.user as AuthenticatedUser).userId).toBe('user-123');
            });

            it('should throw AccountNotActivated for unactivated users', async () => {
                const token = 'valid-jwt-token';
                const inactivePayload = { ...mockJwtPayload, activated: false };
                mockRequest.headers!.authorization = `Bearer ${token}`;
                jwtService.verifyAsync.mockResolvedValue(inactivePayload);

                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    AccountNotActivated
                );
            });

            it('should throw error for invalid JWT token', async () => {
                const token = 'invalid-jwt-token';
                mockRequest.headers!.authorization = `Bearer ${token}`;
                jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    AccountNotActivated
                );
            });

            it('should handle malformed authorization header', async () => {
                mockRequest.headers!.authorization = 'InvalidFormat';

                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    NotAuthenticated
                );
            });

            it('should handle missing Bearer prefix', async () => {
                mockRequest.headers!.authorization = 'NotBearer token';

                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    NotAuthenticated
                );
            });

            it('should handle API key header (currently not implemented)', async () => {
                mockRequest.headers!['x-api-key'] = 'api-key-123';

                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    'Not implemented'
                );
            });

            it('should handle uppercase API key header', async () => {
                mockRequest.headers!['X-API-KEY'] = 'api-key-123';

                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    'Not implemented'
                );
            });
        });

        describe('WebSocket context', () => {
            beforeEach(() => {
                mockExecutionContext.getType.mockReturnValue('ws');
                reflector.getAllAndOverride.mockReturnValue(false);
            });

            it('should authenticate WebSocket with valid JWT token', async () => {
                const token = 'valid-jwt-token';
                mockSocket.handshake!.headers.authorization = `Bearer ${token}`;
                jwtService.verifyAsync.mockResolvedValue(mockJwtPayload);

                const result = await guard.canActivate(mockExecutionContext);

                expect(result).toBe(true);
                expect(mockSocket.data!.user).toBeInstanceOf(AuthenticatedUser);
                expect((mockSocket.data!.user as AuthenticatedUser).userId).toBe('user-123');
            });

            it('should throw NotAuthenticated for WebSocket without auth', async () => {
                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    NotAuthenticated
                );
            });

            it('should throw AccountNotActivated for WebSocket with unactivated user', async () => {
                const token = 'valid-jwt-token';
                const inactivePayload = { ...mockJwtPayload, activated: false };
                mockSocket.handshake!.headers.authorization = `Bearer ${token}`;
                jwtService.verifyAsync.mockResolvedValue(inactivePayload);

                await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                    AccountNotActivated
                );
            });
        });
    });

    describe('extractJWTTokenFromHeader', () => {
        it('should extract token from valid Bearer header', () => {
            const token = 'jwt-token-123';
            const result = (guard as any).extractJWTTokenFromHeader(`Bearer ${token}`);
            expect(result).toBe(token);
        });

        it('should return undefined for invalid header format', () => {
            const result = (guard as any).extractJWTTokenFromHeader('InvalidFormat');
            expect(result).toBeUndefined();
        });

        it('should return undefined for undefined header', () => {
            const result = (guard as any).extractJWTTokenFromHeader(undefined);
            expect(result).toBeUndefined();
        });

        it('should return undefined for empty header', () => {
            const result = (guard as any).extractJWTTokenFromHeader('');
            expect(result).toBeUndefined();
        });
    });

    describe('extractAPITokenFromHeader', () => {
        it('should extract token from string header', () => {
            const token = 'api-token-123';
            const result = (guard as any).extractAPITokenFromHeader(token);
            expect(result).toBe(token);
        });

        it('should return undefined for array header', () => {
            const result = (guard as any).extractAPITokenFromHeader(['token1', 'token2']);
            expect(result).toBeUndefined();
        });

        it('should return undefined for undefined header', () => {
            const result = (guard as any).extractAPITokenFromHeader(undefined);
            expect(result).toBeUndefined();
        });
    });

    describe('verifyJWTToken', () => {
        it('should return valid result for correct token', async () => {
            const token = 'valid-token';
            jwtService.verifyAsync.mockResolvedValue(mockJwtPayload);

            const [isValid, user] = await (guard as any).verifyJWTToken(token);

            expect(isValid).toBe(true);
            expect(user).toBeInstanceOf(AuthenticatedUser);
            expect(user.userId).toBe('user-123');
            expect(user.roles).toEqual(['USER']);
            expect(user.activated).toBe(true);
        });

        it('should return invalid result for malformed token', async () => {
            const token = 'invalid-token';
            jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

            const [isValid, user] = await (guard as any).verifyJWTToken(token);

            expect(isValid).toBe(false);
            expect(user).toBeUndefined();
        });

        it('should handle JWT verification with multiple roles', async () => {
            const token = 'valid-token';
            const payloadWithMultipleRoles = {
                ...mockJwtPayload,
                roles: ['USER', 'ADMIN']
            };
            jwtService.verifyAsync.mockResolvedValue(payloadWithMultipleRoles);

            const [isValid, user] = await (guard as any).verifyJWTToken(token);

            expect(isValid).toBe(true);
            expect(user.roles).toEqual(['USER', 'ADMIN']);
        });
    });

    describe('verifyAPIToken', () => {
        it.skip('should throw "Not implemented" error', async () => {
            // This test is skipped because verifyAPIToken is not implemented yet (commented out)
            // await expect((guard as any).___verifyAPIToken('any-token')).rejects.toThrow(
            //     'Not implemented'
            // );
        });
    });
});
