import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersRepository } from './users.repository';
import { User } from './users.entity';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { EntityNotFound, UserDoesNotExist } from 'src/types/error.types';

describe('UsersRepository', () => {
    let usersRepository: UsersRepository;

    // Mock user data
    const mockUser: User = {
        id: 'user-123',
        first_name: 'John',
        last_name: 'Doe',
        handle: 'johndoe',
        email: 'john.doe@example.com',
        password: 'hashedpassword',
        social: false,
        social_register_type: undefined,
        setup_done: true,
        activated: true,
        avatar_url: 'https://example.com/avatar.jpg',
        created_on: new Date('2024-01-01'),
        registration_verified: true,
        oauth_integration: undefined,
        social_id: undefined,
        setup_temporary_conf: undefined,
        default_org: undefined,
        // Relations
        organizations_created: [],
        policies: [],
        analyzers_created: [],
        invitations: [],
        organizationMemberships: [],
        ownerships: [],
        integrations: [],
        projects_imported: [],
        integrations_owned: [],
        analyses: [],
        files_imported: [],
        mails: []
    } as unknown as User;

    const mockUserRepository = {
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        save: jest.fn(),
        delete: jest.fn()
    };

    const mockOrganizationsRepository = {
        removeUserMemberships: jest.fn()
    };

    const mockProjectsRepository = {
        deleteUserProjects: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersRepository,
                {
                    provide: getRepositoryToken(User, 'codeclarity'),
                    useValue: mockUserRepository
                },
                {
                    provide: OrganizationsRepository,
                    useValue: mockOrganizationsRepository
                },
                {
                    provide: ProjectsRepository,
                    useValue: mockProjectsRepository
                }
            ]
        }).compile();

        usersRepository = module.get<UsersRepository>(UsersRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getUserById', () => {
        it('should return user when found', async () => {
            // Arrange
            mockUserRepository.findOne.mockResolvedValue(mockUser);

            // Act
            const result = await usersRepository.getUserById('user-123');

            // Assert
            expect(result).toEqual(mockUser);
            expect(mockUserRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                relations: undefined
            });
        });

        it('should return user with relations when specified', async () => {
            // Arrange
            const relations = { default_org: true, organizationMemberships: true };
            mockUserRepository.findOne.mockResolvedValue(mockUser);

            // Act
            const result = await usersRepository.getUserById('user-123', relations);

            // Assert
            expect(result).toEqual(mockUser);
            expect(mockUserRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                relations: relations
            });
        });

        it('should throw EntityNotFound when user does not exist', async () => {
            // Arrange
            mockUserRepository.findOne.mockResolvedValue(null);

            // Act & Assert
            await expect(usersRepository.getUserById('non-existent-id')).rejects.toThrow(
                EntityNotFound
            );
            expect(mockUserRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'non-existent-id' },
                relations: undefined
            });
        });

        it('should handle database errors', async () => {
            // Arrange
            const dbError = new Error('Database connection failed');
            mockUserRepository.findOne.mockRejectedValue(dbError);

            // Act & Assert
            await expect(usersRepository.getUserById('user-123')).rejects.toThrow(dbError);
        });
    });

    describe('getUserByEmail', () => {
        it('should return user when found by email', async () => {
            // Arrange
            mockUserRepository.findOneBy.mockResolvedValue(mockUser);

            // Act
            const result = await usersRepository.getUserByEmail('john.doe@example.com');

            // Assert
            expect(result).toEqual(mockUser);
            expect(mockUserRepository.findOneBy).toHaveBeenCalledWith({
                email: 'john.doe@example.com'
            });
        });

        it('should throw UserDoesNotExist when user not found', async () => {
            // Arrange
            mockUserRepository.findOneBy.mockResolvedValue(null);

            // Act & Assert
            await expect(usersRepository.getUserByEmail('unknown@example.com')).rejects.toThrow(
                UserDoesNotExist
            );
            expect(mockUserRepository.findOneBy).toHaveBeenCalledWith({
                email: 'unknown@example.com'
            });
        });

        it('should handle case-sensitive email lookup', async () => {
            // Arrange
            mockUserRepository.findOneBy.mockResolvedValue(mockUser);

            // Act
            await usersRepository.getUserByEmail('John.Doe@Example.com');

            // Assert
            expect(mockUserRepository.findOneBy).toHaveBeenCalledWith({
                email: 'John.Doe@Example.com'
            });
        });
    });

    describe('saveUser', () => {
        it('should save and return the user', async () => {
            // Arrange
            const updatedUser = { ...mockUser, first_name: 'Jane' };
            mockUserRepository.save.mockResolvedValue(updatedUser);

            // Act
            const result = await usersRepository.saveUser(mockUser);

            // Assert
            expect(result).toEqual(updatedUser);
            expect(mockUserRepository.save).toHaveBeenCalledWith(mockUser);
        });

        it('should handle save errors', async () => {
            // Arrange
            const saveError = new Error('Unique constraint violation');
            mockUserRepository.save.mockRejectedValue(saveError);

            // Act & Assert
            await expect(usersRepository.saveUser(mockUser)).rejects.toThrow(saveError);
        });

        it('should save partial user updates', async () => {
            // Arrange
            const partialUser = { id: 'user-123', first_name: 'Updated' } as User;
            mockUserRepository.save.mockResolvedValue(mockUser);

            // Act
            const result = await usersRepository.saveUser(partialUser);

            // Assert
            expect(mockUserRepository.save).toHaveBeenCalledWith(partialUser);
            expect(result).toEqual(mockUser);
        });
    });

    describe('deleteUser', () => {
        it('should delete user and related data', async () => {
            // Arrange
            mockOrganizationsRepository.removeUserMemberships.mockResolvedValue(undefined);
            mockProjectsRepository.deleteUserProjects.mockResolvedValue(undefined);
            mockUserRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            // Act
            await usersRepository.deleteUser('user-123');

            // Assert
            expect(mockOrganizationsRepository.removeUserMemberships).toHaveBeenCalledWith(
                'user-123'
            );
            expect(mockProjectsRepository.deleteUserProjects).toHaveBeenCalledWith('user-123');
            expect(mockUserRepository.delete).toHaveBeenCalledWith('user-123');
        });

        it('should call delete operations in correct order', async () => {
            // Arrange
            const callOrder: string[] = [];
            mockOrganizationsRepository.removeUserMemberships.mockImplementation(() => {
                callOrder.push('removeUserMemberships');
                return Promise.resolve();
            });
            mockProjectsRepository.deleteUserProjects.mockImplementation(() => {
                callOrder.push('deleteUserProjects');
                return Promise.resolve();
            });
            mockUserRepository.delete.mockImplementation(() => {
                callOrder.push('deleteUser');
                return Promise.resolve({ affected: 1, raw: {} });
            });

            // Act
            await usersRepository.deleteUser('user-123');

            // Assert
            expect(callOrder).toEqual([
                'removeUserMemberships',
                'deleteUserProjects',
                'deleteUser'
            ]);
        });

        it('should handle errors in membership removal', async () => {
            // Arrange
            const error = new Error('Failed to remove memberships');
            mockOrganizationsRepository.removeUserMemberships.mockRejectedValue(error);

            // Act & Assert
            await expect(usersRepository.deleteUser('user-123')).rejects.toThrow(error);
            expect(mockProjectsRepository.deleteUserProjects).not.toHaveBeenCalled();
            expect(mockUserRepository.delete).not.toHaveBeenCalled();
        });

        it('should handle errors in project deletion', async () => {
            // Arrange
            const error = new Error('Failed to delete projects');
            mockOrganizationsRepository.removeUserMemberships.mockResolvedValue(undefined);
            mockProjectsRepository.deleteUserProjects.mockRejectedValue(error);

            // Act & Assert
            await expect(usersRepository.deleteUser('user-123')).rejects.toThrow(error);
            expect(mockOrganizationsRepository.removeUserMemberships).toHaveBeenCalled();
            expect(mockUserRepository.delete).not.toHaveBeenCalled();
        });

        it('should handle errors in user deletion', async () => {
            // Arrange
            const error = new Error('Failed to delete user');
            mockOrganizationsRepository.removeUserMemberships.mockResolvedValue(undefined);
            mockProjectsRepository.deleteUserProjects.mockResolvedValue(undefined);
            mockUserRepository.delete.mockRejectedValue(error);

            // Act & Assert
            await expect(usersRepository.deleteUser('user-123')).rejects.toThrow(error);
            expect(mockOrganizationsRepository.removeUserMemberships).toHaveBeenCalled();
            expect(mockProjectsRepository.deleteUserProjects).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle empty string user ID', async () => {
            // Arrange
            mockUserRepository.findOne.mockResolvedValue(null);

            // Act & Assert
            await expect(usersRepository.getUserById('')).rejects.toThrow(EntityNotFound);
        });

        it('should handle empty string email', async () => {
            // Arrange
            mockUserRepository.findOneBy.mockResolvedValue(null);

            // Act & Assert
            await expect(usersRepository.getUserByEmail('')).rejects.toThrow(UserDoesNotExist);
        });

        it('should handle null relations parameter', async () => {
            // Arrange
            mockUserRepository.findOne.mockResolvedValue(mockUser);

            // Act
            const result = await usersRepository.getUserById('user-123', null as any);

            // Assert
            expect(result).toEqual(mockUser);
            expect(mockUserRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                relations: null
            });
        });

        it('should handle special characters in email', async () => {
            // Arrange
            const specialEmail = 'user+test@example.com';
            mockUserRepository.findOneBy.mockResolvedValue(mockUser);

            // Act
            await usersRepository.getUserByEmail(specialEmail);

            // Assert
            expect(mockUserRepository.findOneBy).toHaveBeenCalledWith({
                email: specialEmail
            });
        });
    });
});
