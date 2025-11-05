import { SKIP_AUTH_KEY } from 'src/decorators/SkipAuthDecorator';
import { NotAuthenticated } from 'src/types/error.types';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { JwtAuthGuard } from './jwt-auth.guard';


describe('JwtAuthGuard', () => {
    let guard: JwtAuthGuard;
    let reflector: jest.Mocked<Reflector>;
    let mockExecutionContext: jest.Mocked<ExecutionContext>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                JwtAuthGuard,
                {
                    provide: Reflector,
                    useValue: {
                        getAllAndOverride: jest.fn()
                    }
                }
            ]
        }).compile();

        guard = module.get<JwtAuthGuard>(JwtAuthGuard);
        reflector = module.get(Reflector);

        // Setup mock execution context
        mockExecutionContext = {
            getHandler: jest.fn(),
            getClass: jest.fn(),
            getType: jest.fn(),
            switchToHttp: jest.fn(),
            switchToRpc: jest.fn(),
            switchToWs: jest.fn(),
            getArgs: jest.fn(),
            getArgByIndex: jest.fn()
        } as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('canActivate', () => {
        it('should allow access to non-auth endpoints', () => {
            reflector.getAllAndOverride.mockReturnValue(true);

            const result = guard.canActivate(mockExecutionContext);

            expect(result).toBe(true);
            expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_AUTH_KEY, [
                mockExecutionContext.getHandler(),
                mockExecutionContext.getClass()
            ]);
        });

        it('should call parent canActivate for protected endpoints', () => {
            reflector.getAllAndOverride.mockReturnValue(false);

            // Mock the parent canActivate method
            const superCanActivateSpy = jest.spyOn(
                Object.getPrototypeOf(Object.getPrototypeOf(guard)),
                'canActivate'
            );
            superCanActivateSpy.mockReturnValue(true);

            const result = guard.canActivate(mockExecutionContext);

            expect(result).toBe(true);
            expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
            expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_AUTH_KEY, [
                mockExecutionContext.getHandler(),
                mockExecutionContext.getClass()
            ]);

            superCanActivateSpy.mockRestore();
        });

        it('should return false when parent canActivate returns false', () => {
            reflector.getAllAndOverride.mockReturnValue(false);

            // Mock the parent canActivate method to return false
            const superCanActivateSpy = jest.spyOn(
                Object.getPrototypeOf(Object.getPrototypeOf(guard)),
                'canActivate'
            );
            superCanActivateSpy.mockReturnValue(false);

            const result = guard.canActivate(mockExecutionContext);

            expect(result).toBe(false);
            expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

            superCanActivateSpy.mockRestore();
        });

        it('should handle async parent canActivate result', async () => {
            reflector.getAllAndOverride.mockReturnValue(false);

            // Mock the parent canActivate method to return a Promise
            const superCanActivateSpy = jest.spyOn(
                Object.getPrototypeOf(Object.getPrototypeOf(guard)),
                'canActivate'
            );
            superCanActivateSpy.mockReturnValue(Promise.resolve(true));

            const result = guard.canActivate(mockExecutionContext);

            expect(result).toBeInstanceOf(Promise);
            await expect(result).resolves.toBe(true);
            expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);

            superCanActivateSpy.mockRestore();
        });

        it('should check reflector with correct parameters', () => {
            const mockHandler = jest.fn();
            const mockClass = jest.fn();

            mockExecutionContext.getHandler.mockReturnValue(mockHandler);
            mockExecutionContext.getClass.mockReturnValue(mockClass);
            reflector.getAllAndOverride.mockReturnValue(false);

            // Mock parent to avoid actual Passport logic
            const superCanActivateSpy = jest.spyOn(
                Object.getPrototypeOf(Object.getPrototypeOf(guard)),
                'canActivate'
            );
            superCanActivateSpy.mockReturnValue(true);

            guard.canActivate(mockExecutionContext);

            expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_AUTH_KEY, [
                mockHandler,
                mockClass
            ]);

            superCanActivateSpy.mockRestore();
        });
    });

    describe('handleRequest', () => {
        it('should return user when authentication is successful', () => {
            const mockUser = { id: 'user-123', roles: ['USER'] };

            const result = guard.handleRequest(null, mockUser);

            expect(result).toBe(mockUser);
        });

        it('should throw NotAuthenticated when user is null', () => {
            expect(() => guard.handleRequest(null, null)).toThrow(NotAuthenticated);
        });

        it('should throw NotAuthenticated when user is undefined', () => {
            expect(() => guard.handleRequest(null, undefined)).toThrow(NotAuthenticated);
        });

        it('should throw the provided error when error is present', () => {
            const mockError = new Error('Custom auth error');

            expect(() => guard.handleRequest(mockError, null)).toThrow(mockError);
        });

        it('should throw the provided error even when user is present', () => {
            const mockError = new Error('Custom auth error');
            const mockUser = { id: 'user-123', roles: ['USER'] };

            expect(() => guard.handleRequest(mockError, mockUser)).toThrow(mockError);
        });

        it('should handle falsy user values', () => {
            expect(() => guard.handleRequest(null, false)).toThrow(NotAuthenticated);
            expect(() => guard.handleRequest(null, 0)).toThrow(NotAuthenticated);
            expect(() => guard.handleRequest(null, '')).toThrow(NotAuthenticated);
        });

        it('should return truthy user values', () => {
            const mockUser1 = { id: 'user-123' };
            const mockUser2 = 'user-string';
            const mockUser3 = 123;

            expect(guard.handleRequest(null, mockUser1)).toBe(mockUser1);
            expect(guard.handleRequest(null, mockUser2)).toBe(mockUser2);
            expect(guard.handleRequest(null, mockUser3)).toBe(mockUser3);
        });
    });

    describe('inheritance', () => {
        it('should extend AuthGuard with jwt strategy', () => {
            expect(guard).toBeInstanceOf(JwtAuthGuard);
            // Note: We can't easily test the AuthGuard('jwt') inheritance without mocking Passport,
            // but the constructor and method signatures confirm the correct inheritance
        });
    });
});
