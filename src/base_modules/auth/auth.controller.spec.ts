import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser, ROLE, TokenResponse, TokenRefreshResponse } from './auth.types';
import { UserCreateBody, RegistrationConfirmationBody } from '../users/user.types';
import { User } from '../users/users.entity';
import {
    WrongCredentials,
    RegistrationNotVerified,
    PasswordsDoNotMatch,
    AccountRegistrationVerificationTokenInvalidOrExpired,
    PasswordResetTokenInvalidOrExpired
} from './auth.errors';
import { EmailAlreadyExists } from '../../types/error.types';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { CombinedAuthGuard } from './guards/combined.guard';
import { RefreshJwtAuthGuard } from './guards/refresh-token.guard';

describe('AuthController', () => {
    let controller: AuthController;
    let authService: jest.Mocked<AuthService>;
    let usersService: jest.Mocked<UsersService>;

    const mockUser = {
        id: 'test-user-id',
        first_name: 'Test',
        last_name: 'User',
        email: 'test@example.com',
        password: 'hashedpassword',
        activated: true,
        setup_done: true,
        registration_verified: true,
        social: false,
        created_on: new Date(),
        updated_on: new Date()
    } as unknown as User;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    const mockTokenResponse: TokenResponse = {
        token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_expiry: new Date(),
        refresh_token_expiry: new Date()
    };

    beforeEach(async () => {
        const mockAuthService = {
            authenticate: jest.fn(),
            getAuthenticatedUser: jest.fn(),
            refresh: jest.fn()
        };

        const mockUsersService = {
            register: jest.fn(),
            confirmRegistration: jest.fn(),
            requestPasswordReset: jest.fn(),
            resetPassword: jest.fn()
        };

        const mockCombinedAuthGuard = {
            canActivate: jest.fn().mockReturnValue(true)
        };

        const mockRefreshJwtAuthGuard = {
            canActivate: jest.fn().mockReturnValue(true)
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                { provide: AuthService, useValue: mockAuthService },
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
                { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } }
            ]
        })
        .overrideGuard(CombinedAuthGuard)
        .useValue(mockCombinedAuthGuard)
        .overrideGuard(RefreshJwtAuthGuard)
        .useValue(mockRefreshJwtAuthGuard)
        .compile();

        controller = module.get<AuthController>(AuthController);
        authService = module.get(AuthService);
        usersService = module.get(UsersService);
    });

    describe('registerAccount', () => {
        it('should register a new user successfully', async () => {
            const userCreateBody: UserCreateBody = {
                first_name: 'Test',
                last_name: 'User',
                email: 'test@example.com',
                handle: 'testuser',
                password: 'password123',
                password_confirmation: 'password123'
            };

            usersService.register.mockResolvedValue('new-user-id');

            const result = await controller.registerAccount(userCreateBody);

            expect(usersService.register).toHaveBeenCalledWith(userCreateBody);
            expect(result).toEqual({ id: 'new-user-id' });
        });

        it('should throw PasswordsDoNotMatch when passwords do not match', async () => {
            const userCreateBody: UserCreateBody = {
                first_name: 'Test',
                last_name: 'User',
                email: 'test@example.com',
                handle: 'testuser',
                password: 'password123',
                password_confirmation: 'different123'
            };

            usersService.register.mockRejectedValue(new PasswordsDoNotMatch());

            await expect(controller.registerAccount(userCreateBody)).rejects.toThrow(
                PasswordsDoNotMatch
            );
        });

        it('should throw EmailAlreadyExists when email is already taken', async () => {
            const userCreateBody: UserCreateBody = {
                first_name: 'Test',
                last_name: 'User',
                email: 'existing@example.com',
                handle: 'testuser',
                password: 'password123',
                password_confirmation: 'password123'
            };

            usersService.register.mockRejectedValue(new EmailAlreadyExists());

            await expect(controller.registerAccount(userCreateBody)).rejects.toThrow(
                EmailAlreadyExists
            );
        });
    });

    describe('getAuthenticatedAccount', () => {
        it('should return authenticated user', async () => {
            authService.getAuthenticatedUser.mockResolvedValue(mockUser);

            const result = await controller.getAuthenticatedAccount(mockAuthenticatedUser);

            expect(authService.getAuthenticatedUser).toHaveBeenCalledWith(mockAuthenticatedUser);
            expect(result).toEqual({ data: mockUser });
        });
    });

    describe('authenticate', () => {
        it('should authenticate user with valid credentials', async () => {
            const authenticateBody = {
                email: 'test@example.com',
                password: 'password123'
            };

            authService.authenticate.mockResolvedValue(mockTokenResponse);

            const result = await controller.authenticate(authenticateBody);

            expect(authService.authenticate).toHaveBeenCalledWith(
                authenticateBody.email,
                authenticateBody.password
            );
            expect(result).toEqual({ data: mockTokenResponse });
        });

        it('should throw WrongCredentials for invalid credentials', async () => {
            const authenticateBody = {
                email: 'test@example.com',
                password: 'wrongpassword'
            };

            authService.authenticate.mockRejectedValue(new WrongCredentials());

            await expect(controller.authenticate(authenticateBody)).rejects.toThrow(
                WrongCredentials
            );
        });

        it('should throw RegistrationNotVerified for unverified account', async () => {
            const authenticateBody = {
                email: 'unverified@example.com',
                password: 'password123'
            };

            authService.authenticate.mockRejectedValue(new RegistrationNotVerified());

            await expect(controller.authenticate(authenticateBody)).rejects.toThrow(
                RegistrationNotVerified
            );
        });
    });

    describe('confirmRegistration', () => {
        it('should confirm registration with valid token', async () => {
            const confirmationBody: RegistrationConfirmationBody = {
                token: 'valid-token',
                user_id_hash: 'user-hash'
            };

            usersService.confirmRegistration.mockResolvedValue(undefined);

            const result = await controller.confirmRegistration(confirmationBody);

            expect(usersService.confirmRegistration).toHaveBeenCalledWith(
                confirmationBody.token,
                confirmationBody.user_id_hash
            );
            expect(result).toEqual({});
        });

        it('should throw error for invalid token', async () => {
            const confirmationBody: RegistrationConfirmationBody = {
                token: 'invalid-token',
                user_id_hash: 'user-hash'
            };

            usersService.confirmRegistration.mockRejectedValue(
                new AccountRegistrationVerificationTokenInvalidOrExpired()
            );

            await expect(controller.confirmRegistration(confirmationBody)).rejects.toThrow(
                AccountRegistrationVerificationTokenInvalidOrExpired
            );
        });
    });

    describe('requestPasswordReset', () => {
        it('should request password reset successfully', async () => {
            const resetRequestBody = { email: 'test@example.com' };

            usersService.requestPasswordReset.mockResolvedValue(undefined);

            const result = await controller.requestPasswordReset(resetRequestBody);

            expect(usersService.requestPasswordReset).toHaveBeenCalledWith(resetRequestBody.email);
            expect(result).toEqual({});
        });
    });

    describe('passwordReset', () => {
        it('should reset password with valid token', async () => {
            const resetBody = {
                token: 'valid-token',
                user_id_hash: 'user-hash',
                new_password: 'newpassword123',
                new_password_confirmation: 'newpassword123'
            };

            usersService.resetPassword.mockResolvedValue(undefined);

            const result = await controller.passwordReset(resetBody);

            expect(usersService.resetPassword).toHaveBeenCalledWith(
                resetBody.token,
                resetBody.user_id_hash,
                resetBody.new_password,
                resetBody.new_password_confirmation
            );
            expect(result).toEqual({});
        });

        it('should throw error for mismatched passwords', async () => {
            const resetBody = {
                token: 'valid-token',
                user_id_hash: 'user-hash',
                new_password: 'newpassword123',
                new_password_confirmation: 'different123'
            };

            usersService.resetPassword.mockRejectedValue(new PasswordsDoNotMatch());

            await expect(controller.passwordReset(resetBody)).rejects.toThrow(PasswordsDoNotMatch);
        });

        it('should throw error for invalid token', async () => {
            const resetBody = {
                token: 'invalid-token',
                user_id_hash: 'user-hash',
                new_password: 'newpassword123',
                new_password_confirmation: 'newpassword123'
            };

            usersService.resetPassword.mockRejectedValue(new PasswordResetTokenInvalidOrExpired());

            await expect(controller.passwordReset(resetBody)).rejects.toThrow(
                PasswordResetTokenInvalidOrExpired
            );
        });
    });

    describe('refresh', () => {
        it('should refresh token successfully', async () => {
            const mockRefreshResponse: TokenRefreshResponse = {
                token: 'new-access-token',
                token_expiry: new Date()
            };

            authService.refresh.mockResolvedValue(mockRefreshResponse);

            const result = await controller.refresh(mockAuthenticatedUser);

            expect(authService.refresh).toHaveBeenCalledWith(mockAuthenticatedUser);
            expect(result).toEqual({ data: mockRefreshResponse });
        });
    });
});
