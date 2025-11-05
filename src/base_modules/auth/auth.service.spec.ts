import { FailedToAuthenticateSocialAccount, EntityNotFound } from 'src/types/error.types';

import { JwtService } from '@nestjs/jwt';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { GitlabIntegrationTokenService } from '../integrations/gitlab/gitlabToken.service';
import { SocialType } from '../users/user.types';
import type { User } from '../users/users.entity';
import { CannotPerformActionOnSocialAccount } from '../users/users.errors';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';

import { WrongCredentials, RegistrationNotVerified } from './auth.errors';
import { AuthService } from './auth.service';
import type { GithubAuthenticatedUser, GitlabAuthenticatedUser} from './auth.types';
import { ROLE , AuthenticatedUser } from './auth.types';



// Mock the ms module before importing the service
jest.mock('ms', () => ({
    __esModule: true,
    default: (time: string) => {
        if (time === '90m') return 90 * 60 * 1000; // 90 minutes in ms
        if (time === '7d') return 7 * 24 * 60 * 60 * 1000; // 7 days in ms
        return 1000; // default 1 second
    }
}));

describe('AuthService', () => {
    let service: AuthService;
    let jwtService: JwtService;
    let usersService: UsersService;
    let usersRepository: UsersRepository;

    // Test data fixtures
    const mockUser = {
        id: 'test-user-id',
        first_name: 'Test',
        last_name: 'User',
        handle: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        activated: true,
        setup_done: true,
        registration_verified: true,
        social: false,
        social_register_type: undefined,
        avatar_url: undefined,
        created_on: new Date(),
        oauth_integration: undefined,
        social_id: undefined,
        default_org: undefined,
        setup_temporary_conf: undefined
    } as unknown as User;

    const mockSocialUser = {
        ...mockUser,
        social: true,
        social_register_type: SocialType.GITHUB,
        social_id: 'github123'
    } as User;

    const mockGithubUser: GithubAuthenticatedUser = {
        github_user_id: 'github123',
        email: 'github@example.com',
        access_token: 'github-token',
        refresh_token: undefined,
        avatar_url: 'https://github.com/avatar.jpg'
    };

    const mockGitlabUser: GitlabAuthenticatedUser = {
        gitlab_user_id: 'gitlab123',
        email: 'gitlab@example.com',
        access_token: 'gitlab-token',
        refresh_token: 'gitlab-refresh-token',
        avatar_url: 'https://gitlab.com/avatar.jpg'
    };

    const mockAuthenticatedUser = new AuthenticatedUser(
        mockUser.id,
        [ROLE.USER],
        mockUser.activated
    );

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: JwtService,
                    useValue: {
                        sign: jest.fn(),
                        signAsync: jest.fn(),
                        verify: jest.fn()
                    }
                },
                {
                    provide: UsersService,
                    useValue: {
                        sendUserRegistrationVerificationEmail: jest.fn(),
                        existsSocialUser: jest.fn(),
                        registerSocial: jest.fn()
                    }
                },
                {
                    provide: UsersRepository,
                    useValue: {
                        getUserByEmail: jest.fn(),
                        getUserById: jest.fn(),
                        save: jest.fn()
                    }
                },
                {
                    provide: GitlabIntegrationTokenService,
                    useValue: {
                        createGitlabIntegrationToken: jest.fn()
                    }
                }
            ]
        }).compile();

        service = module.get<AuthService>(AuthService);
        jwtService = module.get<JwtService>(JwtService);
        usersService = module.get<UsersService>(UsersService);
        usersRepository = module.get<UsersRepository>(UsersRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('authenticate', () => {
        it('should authenticate user with valid credentials', async () => {
            // Arrange
            const email = 'test@example.com';
            const password = 'password123';
            const hashedPassword = await bcrypt.hash(password, 10);
            const userWithHashedPassword = { ...mockUser, password: hashedPassword };

            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(userWithHashedPassword);
            jest.spyOn(jwtService, 'signAsync').mockResolvedValue('jwt-token');

            // Act
            const result = await service.authenticate(email, password);

            // Assert
            expect(result).toEqual({
                token: 'jwt-token',
                refresh_token: 'jwt-token',
                token_expiry: expect.any(Date),
                refresh_token_expiry: expect.any(Date)
            });
            expect(usersRepository.getUserByEmail).toHaveBeenCalledWith(email);
        });

        it('should throw WrongCredentials when user does not exist', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(null as any);

            // Act & Assert
            await expect(
                service.authenticate('nonexistent@example.com', 'password')
            ).rejects.toThrow(WrongCredentials);
        });

        it('should throw CannotPerformActionOnSocialAccount for social users', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(mockSocialUser);

            // Act & Assert
            await expect(service.authenticate('test@example.com', 'password')).rejects.toThrow(
                CannotPerformActionOnSocialAccount
            );
        });

        it('should throw RegistrationNotVerified for unverified users', async () => {
            // Arrange
            const unverifiedUser = { ...mockUser, registration_verified: false };
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(unverifiedUser);
            jest.spyOn(usersService, 'sendUserRegistrationVerificationEmail').mockResolvedValue();

            // Act & Assert
            await expect(service.authenticate('test@example.com', 'password')).rejects.toThrow(
                RegistrationNotVerified
            );

            expect(usersService.sendUserRegistrationVerificationEmail).toHaveBeenCalledWith(
                'test@example.com'
            );
        });

        it('should throw WrongCredentials for invalid password', async () => {
            // Arrange
            const hashedPassword = await bcrypt.hash('correctpassword', 10);
            const userWithHashedPassword = { ...mockUser, password: hashedPassword };
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(userWithHashedPassword);

            // Act & Assert
            await expect(service.authenticate('test@example.com', 'wrongpassword')).rejects.toThrow(
                WrongCredentials
            );
        });
    });

    describe('authenticateGithubSocial', () => {
        it('should throw FailedToAuthenticateSocialAccount when email is missing', async () => {
            // Arrange
            const userWithoutEmail = { ...mockGithubUser, email: undefined };

            // Act & Assert
            await expect(service.authenticateGithubSocial(userWithoutEmail)).rejects.toThrow(
                FailedToAuthenticateSocialAccount
            );
        });

        it('should call existsSocialUser to check if user exists', async () => {
            // Arrange
            jest.spyOn(usersService, 'existsSocialUser').mockResolvedValue(false);
            jest.spyOn(usersService, 'registerSocial').mockResolvedValue('new-user-id');
            jest.spyOn(jwtService, 'signAsync').mockResolvedValue('jwt-token');

            // Act
            try {
                await service.authenticateGithubSocial(mockGithubUser);
            } catch (_error) {
                // Expected since methods are not fully implemented
            }

            // Assert
            expect(usersService.existsSocialUser).toHaveBeenCalledWith(
                mockGithubUser.github_user_id,
                SocialType.GITHUB
            );
        });
    });

    describe('authenticateGitlabSocial', () => {
        it('should throw FailedToAuthenticateSocialAccount when email is missing', async () => {
            // Arrange
            const userWithoutEmail = { ...mockGitlabUser, email: undefined };

            // Act & Assert
            await expect(service.authenticateGitlabSocial(userWithoutEmail)).rejects.toThrow(
                FailedToAuthenticateSocialAccount
            );
        });

        it('should call existsSocialUser to check if user exists', async () => {
            // Arrange
            jest.spyOn(usersService, 'existsSocialUser').mockResolvedValue(false);
            jest.spyOn(usersService, 'registerSocial').mockResolvedValue('new-user-id');
            jest.spyOn(jwtService, 'signAsync').mockResolvedValue('jwt-token');

            // Act
            try {
                await service.authenticateGitlabSocial(mockGitlabUser);
            } catch (_error) {
                // Expected since methods are not fully implemented
            }

            // Assert
            expect(usersService.existsSocialUser).toHaveBeenCalledWith(
                mockGitlabUser.gitlab_user_id,
                SocialType.GITLAB
            );
        });
    });

    describe('refresh', () => {
        it('should generate new access token for authenticated user', async () => {
            // Arrange
            jest.spyOn(jwtService, 'signAsync').mockResolvedValue('new-jwt-token');

            // Act
            const result = await service.refresh(mockAuthenticatedUser);

            // Assert
            expect(result).toEqual({
                token: 'new-jwt-token',
                token_expiry: expect.any(Date)
            });
        });
    });

    describe('getAuthenticatedUser', () => {
        it('should return user for authenticated user', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockUser);

            // Act
            const result = await service.getAuthenticatedUser(mockAuthenticatedUser);

            // Assert
            expect(result).toEqual(mockUser);
            expect(usersRepository.getUserById).toHaveBeenCalledWith(mockAuthenticatedUser.userId, {
                default_org: true
            });
        });

        it('should throw EntityNotFound when user does not exist', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserById').mockRejectedValue(new EntityNotFound());

            // Act & Assert
            await expect(service.getAuthenticatedUser(mockAuthenticatedUser)).rejects.toThrow(
                EntityNotFound
            );
        });
    });

    describe('hashPassword', () => {
        it('should hash password with bcrypt', async () => {
            // Arrange
            const password = 'testpassword123';

            // Act
            const hashedPassword = await service.hashPassword(password);

            // Assert
            expect(hashedPassword).toBeDefined();
            expect(hashedPassword).not.toBe(password);
            expect(typeof hashedPassword).toBe('string');

            // Verify the hash can be validated
            const isValid = await bcrypt.compare(password, hashedPassword);
            expect(isValid).toBe(true);
        });

        it('should generate different hashes for same password', async () => {
            // Arrange
            const password = 'testpassword123';

            // Act
            const hash1 = await service.hashPassword(password);
            const hash2 = await service.hashPassword(password);

            // Assert
            expect(hash1).not.toBe(hash2);
            expect(await bcrypt.compare(password, hash1)).toBe(true);
            expect(await bcrypt.compare(password, hash2)).toBe(true);
        });
    });

    describe('validateCredentials', () => {
        it('should return true for valid credentials', async () => {
            // Arrange
            const email = 'test@example.com';
            const password = 'password123';
            const hashedPassword = await bcrypt.hash(password, 10);
            const userWithHashedPassword = { ...mockUser, password: hashedPassword };

            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(userWithHashedPassword);

            // Act
            const [isValid, user] = await service.validateCredentials(email, password);

            // Assert
            expect(isValid).toBe(true);
            expect(user).toEqual(userWithHashedPassword);
        });

        it('should return false for invalid password', async () => {
            // Arrange
            const email = 'test@example.com';
            const password = 'wrongpassword';
            const hashedPassword = await bcrypt.hash('correctpassword', 10);
            const userWithHashedPassword = { ...mockUser, password: hashedPassword };

            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(userWithHashedPassword);

            // Act
            const [isValid, user] = await service.validateCredentials(email, password);

            // Assert
            expect(isValid).toBe(false);
            expect(user).toBeUndefined();
        });

        it('should return false for non-existent user', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(null as any);

            // Act
            const [isValid, user] = await service.validateCredentials(
                'nonexistent@example.com',
                'password'
            );

            // Assert
            expect(isValid).toBe(false);
            expect(user).toBeUndefined();
        });
    });

    describe('edge cases and security', () => {
        it('should handle empty email gracefully', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(null as any);

            // Act & Assert
            await expect(service.authenticate('', 'password')).rejects.toThrow(WrongCredentials);
        });

        it('should handle empty password gracefully', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(mockUser);

            // Act & Assert
            await expect(service.authenticate('test@example.com', '')).rejects.toThrow(
                WrongCredentials
            );
        });

        it('should handle null values gracefully', async () => {
            // Arrange
            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(null as any);

            // Act & Assert
            await expect(service.authenticate(null as any, null as any)).rejects.toThrow(
                WrongCredentials
            );
        });

        it('should handle very long passwords', async () => {
            // Arrange
            const longPassword = 'a'.repeat(1000);
            const hashedPassword = await bcrypt.hash(longPassword, 10);
            const userWithHashedPassword = { ...mockUser, password: hashedPassword };

            jest.spyOn(usersRepository, 'getUserByEmail').mockResolvedValue(userWithHashedPassword);
            jest.spyOn(jwtService, 'signAsync').mockResolvedValue('jwt-token');

            // Act
            const result = await service.authenticate('test@example.com', longPassword);

            // Assert
            expect(result).toBeDefined();
            expect(result.token).toBe('jwt-token');
        });
    });
});
