import { NotAuthorized, NotAMember } from 'src/types/error.types';

import { Test, type TestingModule } from '@nestjs/testing';

import { AuthenticatedUser, ROLE } from '../auth/auth.types';
import { MemberRole } from '../organizations/memberships/orgMembership.types';
import { OrganizationsRepository } from '../organizations/organizations.repository';

import { IntegrationType, IntegrationProvider, type Integration } from './integrations.entity';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService } from './integrations.service';



describe('IntegrationsService', () => {
    let service: IntegrationsService;
    let organizationsRepository: OrganizationsRepository;
    let integrationsRepository: IntegrationsRepository;

    // Mock data
    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockIntegration = {
        id: 'integration-123',
        integration_type: IntegrationType.VCS,
        integration_provider: IntegrationProvider.GITHUB,
        access_token: 'token-123',
        token_type: 'Bearer',
        refresh_token: 'refresh-123',
        expiry_date: new Date('2025-01-01'),
        invalid: false,
        service_domain: 'github.com',
        added_on: new Date('2024-01-01'),
        last_repository_sync: new Date('2024-06-01'),
        organizations: [{ id: 'org-123' }],
        users: [{ id: 'user-123' }],
        projects: [],
        analyses: [],
        owner: { id: 'user-123' }
    } as unknown as Integration;

    const mockPaginatedIntegrations = {
        data: [mockIntegration],
        page: 0,
        entry_count: 1,
        entries_per_page: 10,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {}
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                IntegrationsService,
                {
                    provide: OrganizationsRepository,
                    useValue: {
                        hasRequiredRole: jest.fn(),
                        doesIntegrationBelongToOrg: jest.fn()
                    }
                },
                {
                    provide: IntegrationsRepository,
                    useValue: {
                        getVCSIntegrations: jest.fn(),
                        getIntegrationById: jest.fn()
                    }
                }
            ]
        }).compile();

        service = module.get<IntegrationsService>(IntegrationsService);
        organizationsRepository = module.get<OrganizationsRepository>(OrganizationsRepository);
        integrationsRepository = module.get<IntegrationsRepository>(IntegrationsRepository);

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('getVCSIntegrations', () => {
        it('should retrieve VCS integrations successfully', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(integrationsRepository, 'getVCSIntegrations').mockResolvedValue(
                mockPaginatedIntegrations
            );

            // Act
            const result = await service.getVCSIntegrations('org-123', paginationConfig, mockUser);

            // Assert
            expect(result).toEqual(mockPaginatedIntegrations);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(integrationsRepository.getVCSIntegrations).toHaveBeenCalledWith(
                'org-123',
                0,
                10
            );
        });

        it('should require USER role for access', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            const unauthorizedError = new NotAuthorized();
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(
                service.getVCSIntegrations('org-123', paginationConfig, mockUser)
            ).rejects.toThrow(unauthorizedError);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
        });

        it('should apply pagination limits correctly', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 200 }; // Over limit
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(integrationsRepository, 'getVCSIntegrations').mockResolvedValue(
                mockPaginatedIntegrations
            );

            // Act
            await service.getVCSIntegrations('org-123', paginationConfig, mockUser);

            // Assert
            expect(integrationsRepository.getVCSIntegrations).toHaveBeenCalledWith(
                'org-123',
                0,
                100
            ); // Max limit applied
        });

        it('should use default pagination when not provided', async () => {
            // Arrange
            const paginationConfig = {};
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(integrationsRepository, 'getVCSIntegrations').mockResolvedValue(
                mockPaginatedIntegrations
            );

            // Act
            await service.getVCSIntegrations('org-123', paginationConfig, mockUser);

            // Assert
            expect(integrationsRepository.getVCSIntegrations).toHaveBeenCalledWith(
                'org-123',
                0,
                10
            ); // Defaults
        });

        it('should handle custom pagination settings', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 25 };
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(integrationsRepository, 'getVCSIntegrations').mockResolvedValue(
                mockPaginatedIntegrations
            );

            // Act
            await service.getVCSIntegrations('org-123', paginationConfig, mockUser);

            // Assert
            expect(integrationsRepository.getVCSIntegrations).toHaveBeenCalledWith(
                'org-123',
                0,
                25
            );
        });

        it('should always use page 0 (current implementation)', async () => {
            // Note: The current implementation hardcodes currentPage = 0
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 5 }; // currentPage is ignored
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(integrationsRepository, 'getVCSIntegrations').mockResolvedValue(
                mockPaginatedIntegrations
            );

            // Act
            await service.getVCSIntegrations('org-123', paginationConfig, mockUser);

            // Assert
            expect(integrationsRepository.getVCSIntegrations).toHaveBeenCalledWith(
                'org-123',
                0,
                10
            ); // currentPage is 0
        });
    });

    describe('getIntegration', () => {
        it('should retrieve integration successfully', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'doesIntegrationBelongToOrg').mockResolvedValue(
                true
            );
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(integrationsRepository, 'getIntegrationById').mockResolvedValue(
                mockIntegration
            );

            // Act
            const result = await service.getIntegration('integration-123', 'org-123', mockUser);

            // Assert
            expect(result).toEqual(mockIntegration);
            expect(organizationsRepository.doesIntegrationBelongToOrg).toHaveBeenCalledWith(
                'integration-123',
                'org-123'
            );
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(integrationsRepository.getIntegrationById).toHaveBeenCalledWith(
                'integration-123'
            );
        });

        it('should throw NotAuthorized when integration does not belong to org', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'doesIntegrationBelongToOrg').mockResolvedValue(
                false
            );

            // Act & Assert
            await expect(
                service.getIntegration('integration-123', 'org-123', mockUser)
            ).rejects.toThrow(NotAuthorized);
            expect(organizationsRepository.doesIntegrationBelongToOrg).toHaveBeenCalledWith(
                'integration-123',
                'org-123'
            );
            expect(organizationsRepository.hasRequiredRole).not.toHaveBeenCalled();
            expect(integrationsRepository.getIntegrationById).not.toHaveBeenCalled();
        });

        it('should require USER role for access', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'doesIntegrationBelongToOrg').mockResolvedValue(
                true
            );
            const unauthorizedError = new NotAuthorized();
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(
                service.getIntegration('integration-123', 'org-123', mockUser)
            ).rejects.toThrow(unauthorizedError);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
        });

        it('should check integration ownership before role validation', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'doesIntegrationBelongToOrg').mockResolvedValue(
                false
            );
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();

            // Act & Assert
            await expect(
                service.getIntegration('integration-123', 'org-123', mockUser)
            ).rejects.toThrow(NotAuthorized);

            // Should check ownership first, then not proceed to role check
            expect(organizationsRepository.doesIntegrationBelongToOrg).toHaveBeenCalledWith(
                'integration-123',
                'org-123'
            );
            expect(organizationsRepository.hasRequiredRole).not.toHaveBeenCalled();
        });
    });

    describe('removeIntegration', () => {
        it('should throw not implemented error for valid requests', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'doesIntegrationBelongToOrg').mockResolvedValue(
                true
            );

            // Act & Assert
            await expect(
                service.removeIntegration('org-123', mockUser, 'integration-123')
            ).rejects.toThrow('Method not implemented.');
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
            expect(organizationsRepository.doesIntegrationBelongToOrg).toHaveBeenCalledWith(
                'integration-123',
                'org-123'
            );
        });

        it('should require ADMIN role for removal', async () => {
            // Arrange
            const unauthorizedError = new NotAuthorized();
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(
                service.removeIntegration('org-123', mockUser, 'integration-123')
            ).rejects.toThrow(unauthorizedError);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
        });

        it('should throw NotAuthorized when integration does not belong to org', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'doesIntegrationBelongToOrg').mockResolvedValue(
                false
            );

            // Act & Assert
            await expect(
                service.removeIntegration('org-123', mockUser, 'integration-123')
            ).rejects.toThrow(NotAuthorized);
            expect(organizationsRepository.doesIntegrationBelongToOrg).toHaveBeenCalledWith(
                'integration-123',
                'org-123'
            );
        });

        it('should handle NotAMember error by converting to NotAuthorized', async () => {
            // Arrange
            const notAMemberError = new NotAMember();
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(
                notAMemberError
            );

            // Act & Assert
            await expect(
                service.removeIntegration('org-123', mockUser, 'integration-123')
            ).rejects.toThrow(NotAuthorized);
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
        });

        it('should re-throw other errors without modification', async () => {
            // Arrange
            const otherError = new Error('Database connection failed');
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockRejectedValue(otherError);

            // Act & Assert
            await expect(
                service.removeIntegration('org-123', mockUser, 'integration-123')
            ).rejects.toThrow(otherError);
        });

        it('should validate both role and integration ownership', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(organizationsRepository, 'doesIntegrationBelongToOrg').mockResolvedValue(
                false
            );

            // Act & Assert
            await expect(
                service.removeIntegration('org-123', mockUser, 'integration-123')
            ).rejects.toThrow(NotAuthorized);

            // Both checks should be called
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
            expect(organizationsRepository.doesIntegrationBelongToOrg).toHaveBeenCalledWith(
                'integration-123',
                'org-123'
            );
        });
    });

    describe('markIntegrationAsInvalid', () => {
        it('should throw not implemented error', async () => {
            // Act & Assert
            await expect(service.markIntegrationAsInvalid('integration-123')).rejects.toThrow(
                'Method not implemented.'
            );
        });

        it('should accept any integration ID', async () => {
            // Act & Assert
            await expect(service.markIntegrationAsInvalid('any-id')).rejects.toThrow(
                'Method not implemented.'
            );
            await expect(service.markIntegrationAsInvalid('')).rejects.toThrow(
                'Method not implemented.'
            );
        });
    });
});
