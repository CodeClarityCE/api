import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LicensePolicyService } from './license.service';
import { Policy, PolicyType } from '../policy.entity';
import { LicensePolicyCreateBody, LicensePolicyType } from './licensePolicy.types';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';
import { UsersRepository } from 'src/base_modules/users/users.repository';

describe('LicensePolicyService', () => {
    let service: LicensePolicyService;
    let organizationsRepository: OrganizationsRepository;
    let usersRepository: UsersRepository;

    // Mock data
    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);
    
    const mockOrganization = {
        id: 'org-123',
        name: 'Test Organization',
        description: 'Test description'
    };

    const mockCreator = {
        id: 'user-123',
        email: 'creator@example.com',
        first_name: 'John',
        last_name: 'Doe'
    };

    const mockPolicy = {
        id: 'policy-123',
        name: 'Test License Policy',
        description: 'Test policy description',
        policy_type: PolicyType.LICENSE_POLICY,
        default: false,
        content: ['MIT', 'Apache-2.0'],
        created_on: new Date('2024-01-01'),
        created_by: mockCreator,
        organizations: [mockOrganization],
        analyses: []
    } as unknown as Policy;

    const mockLicensePolicyCreateBody: LicensePolicyCreateBody = {
        name: 'Test License Policy',
        description: 'Test policy description',
        type: LicensePolicyType.WHITELIST,
        licenses: ['MIT', 'Apache-2.0'],
        default: false
    };

    const mockPolicyRepository = {
        save: jest.fn(),
        findOne: jest.fn(),
        createQueryBuilder: jest.fn()
    };

    // Mock query builder
    const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LicensePolicyService,
                {
                    provide: OrganizationsRepository,
                    useValue: {
                        hasRequiredRole: jest.fn(),
                        getOrganizationById: jest.fn()
                    }
                },
                {
                    provide: UsersRepository,
                    useValue: {
                        getUserById: jest.fn()
                    }
                },
                {
                    provide: getRepositoryToken(Policy, 'codeclarity'),
                    useValue: mockPolicyRepository
                }
            ]
        }).compile();

        service = module.get<LicensePolicyService>(LicensePolicyService);
        organizationsRepository = module.get<OrganizationsRepository>(OrganizationsRepository);
        usersRepository = module.get<UsersRepository>(UsersRepository);

        // Reset mocks
        jest.clearAllMocks();
        mockPolicyRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    describe('create', () => {
        it('should create a license policy successfully', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(mockOrganization as any);
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            mockPolicyRepository.save.mockResolvedValue(mockPolicy);

            // Act
            const result = await service.create('org-123', mockLicensePolicyCreateBody, mockUser);

            // Assert
            expect(result).toBe('policy-123');
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.ADMIN);
            expect(organizationsRepository.getOrganizationById).toHaveBeenCalledWith('org-123');
            expect(usersRepository.getUserById).toHaveBeenCalledWith('user-123');
            expect(mockPolicyRepository.save).toHaveBeenCalledWith({
                policy_type: PolicyType.LICENSE_POLICY,
                default: false,
                created_on: expect.any(Date),
                created_by: mockCreator,
                name: 'Test License Policy',
                description: 'Test policy description',
                content: ['MIT', 'Apache-2.0'],
                organizations: [mockOrganization],
                analyses: []
            });
        });

        it('should throw error when organization not found', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(null as any);

            // Act & Assert
            await expect(service.create('org-123', mockLicensePolicyCreateBody, mockUser))
                .rejects.toThrow('EntityNotFound');
        });

        it('should throw error when user not found', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(mockOrganization as any);
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(null as any);

            // Act & Assert
            await expect(service.create('org-123', mockLicensePolicyCreateBody, mockUser))
                .rejects.toThrow('EntityNotFound');
        });

        it('should require ADMIN role', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(unauthorizedError);

            // Act & Assert
            await expect(service.create('org-123', mockLicensePolicyCreateBody, mockUser))
                .rejects.toThrow(unauthorizedError);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.ADMIN);
        });

        it('should create policy with default flag set to true', async () => {
            // Arrange
            const defaultPolicyCreateBody = { ...mockLicensePolicyCreateBody, default: true };
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(mockOrganization as any);
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            const defaultPolicy = { ...mockPolicy, default: true };
            mockPolicyRepository.save.mockResolvedValue(defaultPolicy);

            // Act
            const result = await service.create('org-123', defaultPolicyCreateBody, mockUser);

            // Assert
            expect(result).toBe('policy-123');
            expect(mockPolicyRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ default: true })
            );
        });

        it('should handle different license policy types', async () => {
            // Arrange
            const blacklistPolicyCreateBody = { 
                ...mockLicensePolicyCreateBody, 
                type: LicensePolicyType.BLACKLIST,
                licenses: ['GPL-3.0', 'AGPL-3.0']
            };
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(mockOrganization as any);
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            mockPolicyRepository.save.mockResolvedValue(mockPolicy);

            // Act
            const result = await service.create('org-123', blacklistPolicyCreateBody, mockUser);

            // Assert
            expect(result).toBe('policy-123');
            expect(mockPolicyRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ 
                    content: ['GPL-3.0', 'AGPL-3.0']
                })
            );
        });
    });

    describe('get', () => {
        it('should retrieve a license policy successfully', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockPolicyRepository.findOne.mockResolvedValue(mockPolicy);

            // Act
            const result = await service.get('org-123', 'policy-123', mockUser);

            // Assert
            expect(result).toEqual(mockPolicy);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.USER);
            expect(mockPolicyRepository.findOne).toHaveBeenCalledWith({
                where: {
                    id: 'policy-123'
                }
            });
        });

        it('should throw error when policy not found', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockPolicyRepository.findOne.mockResolvedValue(null as any);

            // Act & Assert
            await expect(service.get('org-123', 'non-existent', mockUser))
                .rejects.toThrow('EntityNotFound');
        });

        it('should require USER role for read access', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(unauthorizedError);

            // Act & Assert
            await expect(service.get('org-123', 'policy-123', mockUser))
                .rejects.toThrow(unauthorizedError);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.USER);
        });
    });

    describe('getMany', () => {
        it('should retrieve paginated license policies', async () => {
            // Arrange
            const policies = [mockPolicy];
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue(policies);

            // Act
            const result = await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(result).toEqual({
                data: [{
                    id: 'policy-123',
                    name: 'Test License Policy',
                    description: 'Test policy description',
                    default: false,
                    content: ['MIT', 'Apache-2.0'],
                    created_on: new Date('2024-01-01'),
                    created_by: '',
                    policy_type: PolicyType.LICENSE_POLICY
                }],
                page: 0,
                entry_count: 1,
                entries_per_page: 10,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            });
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.USER);
            expect(mockQueryBuilder.where).toHaveBeenCalledWith('organization.id = :orgId', { orgId: 'org-123' });
        });

        it('should apply pagination limits correctly', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 200, currentPage: -1 }; // Over limit and negative page
            
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            // Act
            const result = await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(result.entries_per_page).toBe(100); // Max limit applied
            expect(result.page).toBe(0); // Negative page corrected to 0
            expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
            expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
        });

        it('should use default pagination when not provided', async () => {
            // Arrange
            const paginationConfig = {};
            
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            // Act
            const result = await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(result.entries_per_page).toBe(10); // Default
            expect(result.page).toBe(0); // Default
            expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
            expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
        });

        it('should handle empty results', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            // Act
            const result = await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(result).toEqual({
                data: [],
                page: 0,
                entry_count: 0,
                entries_per_page: 10,
                total_entries: 0,
                total_pages: 0,
                matching_count: 0,
                filter_count: {}
            });
        });

        it('should calculate pagination correctly for multiple pages', async () => {
            // Arrange
            const policies = Array(5).fill(mockPolicy);
            const paginationConfig = { entriesPerPage: 5, currentPage: 2 };
            
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockQueryBuilder.getCount.mockResolvedValue(25);
            mockQueryBuilder.getMany.mockResolvedValue(policies);

            // Act
            const result = await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(result.page).toBe(2);
            expect(result.total_pages).toBe(5); // 25 / 5 = 5 pages
            expect(result.total_entries).toBe(25);
            expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10); // page 2 * 5 entries
            expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
        });

        it('should include proper query joins', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            // Act
            await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('policy.organizations', 'organization');
        });
    });

    describe('update', () => {
        it('should throw not implemented error', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();

            // Act & Assert
            await expect(service.update('org-123', 'policy-123', {}, mockUser))
                .rejects.toThrow('Method not implemented.');
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.ADMIN);
        });

        it('should require ADMIN role for update', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(unauthorizedError);

            // Act & Assert
            await expect(service.update('org-123', 'policy-123', {}, mockUser))
                .rejects.toThrow(unauthorizedError);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.ADMIN);
        });
    });

    describe('remove', () => {
        it('should throw not implemented error', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();

            // Act & Assert
            await expect(service.remove('org-123', 'policy-123', mockUser))
                .rejects.toThrow('Method not implemented.');
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.ADMIN);
        });

        it('should require ADMIN role for removal', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(unauthorizedError);

            // Act & Assert
            await expect(service.remove('org-123', 'policy-123', mockUser))
                .rejects.toThrow(unauthorizedError);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith('org-123', 'user-123', MemberRole.ADMIN);
        });
    });
});