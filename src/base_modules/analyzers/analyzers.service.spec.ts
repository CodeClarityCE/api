import { Test, type TestingModule } from '@nestjs/testing';
import { AuthenticatedUser, ROLE } from '../auth/auth.types';
import { OrganizationLoggerService } from '../organizations/log/organizationLogger.service';
import { ActionType } from '../organizations/log/orgAuditLog.types';
import { MemberRole } from '../organizations/memberships/orgMembership.types';
import {
    MembershipsRepository,
    OrganizationsRepository,
    UsersRepository
} from '../shared/repositories';
import type { Analyzer } from './analyzer.entity';
import type { AnalyzerCreateBody } from './analyzer.types';
import { AnalyzersRepository } from './analyzers.repository';
import { AnalyzersService } from './analyzers.service';

describe('AnalyzersService', () => {
    let service: AnalyzersService;
    let organizationLoggerService: OrganizationLoggerService;
    let organizationsRepository: OrganizationsRepository;
    let membershipsRepository: MembershipsRepository;
    let usersRepository: UsersRepository;
    let analyzersRepository: AnalyzersRepository;

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

    const mockAnalyzer = {
        id: 'analyzer-123',
        name: 'Test Analyzer',
        description: 'Test analyzer description',
        steps: [
            [
                {
                    name: 'step1',
                    version: '1.0.0',
                    config: {
                        option1: { required: true, default: 'value1' }
                    },
                    persistant_config: {}
                }
            ]
        ],
        global: false,
        created_on: new Date('2024-01-01'),
        created_by: mockCreator,
        organization: mockOrganization,
        analyses: []
    } as unknown as Analyzer;

    const mockAnalyzerCreateBody: AnalyzerCreateBody = {
        name: 'Test Analyzer',
        description: 'Test analyzer description',
        steps: [
            [
                {
                    name: 'step1',
                    version: '1.0.0',
                    config: {
                        option1: { required: true, default: 'value1' }
                    },
                    persistant_config: {}
                }
            ]
        ]
    };

    const mockPaginatedAnalyzers = {
        data: [mockAnalyzer],
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
                AnalyzersService,
                {
                    provide: OrganizationLoggerService,
                    useValue: {
                        addAuditLog: jest.fn()
                    }
                },
                {
                    provide: OrganizationsRepository,
                    useValue: {
                        getOrganizationById: jest.fn()
                    }
                },
                {
                    provide: MembershipsRepository,
                    useValue: {
                        hasRequiredRole: jest.fn()
                    }
                },
                {
                    provide: UsersRepository,
                    useValue: {
                        getUserById: jest.fn()
                    }
                },
                {
                    provide: AnalyzersRepository,
                    useValue: {
                        saveAnalyzer: jest.fn(),
                        getAnalyzerById: jest.fn(),
                        getByNameAndOrganization: jest.fn(),
                        doesAnalyzerBelongToOrg: jest.fn(),
                        getManyAnalyzers: jest.fn(),
                        deleteAnalyzer: jest.fn()
                    }
                }
            ]
        }).compile();

        service = module.get<AnalyzersService>(AnalyzersService);
        organizationLoggerService =
            module.get<OrganizationLoggerService>(OrganizationLoggerService);
        organizationsRepository = module.get<OrganizationsRepository>(OrganizationsRepository);
        membershipsRepository = module.get<MembershipsRepository>(MembershipsRepository);
        usersRepository = module.get<UsersRepository>(UsersRepository);
        analyzersRepository = module.get<AnalyzersRepository>(AnalyzersRepository);

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create an analyzer successfully', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(
                mockOrganization as any
            );
            jest.spyOn(analyzersRepository, 'saveAnalyzer').mockResolvedValue(mockAnalyzer);
            jest.spyOn(organizationLoggerService, 'addAuditLog').mockResolvedValue('log-id-123');

            // Act
            const result = await service.create('org-123', mockAnalyzerCreateBody, mockUser);

            // Assert
            expect(result).toBe('analyzer-123');
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
            expect(usersRepository.getUserById).toHaveBeenCalledWith('user-123');
            expect(organizationsRepository.getOrganizationById).toHaveBeenCalledWith('org-123');
            expect(analyzersRepository.saveAnalyzer).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Test Analyzer',
                    description: 'Test analyzer description',
                    steps: mockAnalyzerCreateBody.steps,
                    global: false,
                    created_on: expect.any(Date),
                    created_by: mockCreator,
                    organization: mockOrganization
                })
            );
            expect(organizationLoggerService.addAuditLog).toHaveBeenCalledWith(
                ActionType.AnalyzerCreate,
                'The user added an analyzer Test Analyzer to the organization.',
                'org-123',
                'user-123'
            );
        });

        it('should require ADMIN role', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(
                service.create('org-123', mockAnalyzerCreateBody, mockUser)
            ).rejects.toThrow(unauthorizedError);
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
        });

        it('should handle user not found error', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            const entityNotFoundError = new Error('EntityNotFound');
            jest.spyOn(usersRepository, 'getUserById').mockRejectedValue(entityNotFoundError);

            // Act & Assert
            await expect(
                service.create('org-123', mockAnalyzerCreateBody, mockUser)
            ).rejects.toThrow(entityNotFoundError);
        });

        it('should handle organization not found error', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            const entityNotFoundError = new Error('EntityNotFound');
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockRejectedValue(
                entityNotFoundError
            );

            // Act & Assert
            await expect(
                service.create('org-123', mockAnalyzerCreateBody, mockUser)
            ).rejects.toThrow(entityNotFoundError);
        });

        it('should create analyzer with complex steps configuration', async () => {
            // Arrange
            const complexAnalyzerCreateBody = {
                ...mockAnalyzerCreateBody,
                steps: [
                    [
                        {
                            name: 'step1',
                            version: '1.0.0',
                            config: {
                                option1: { required: true, default: 'value1' },
                                option2: { required: false, default: 'value2' }
                            },
                            persistant_config: {}
                        }
                    ],
                    [
                        {
                            name: 'step2',
                            version: '2.0.0',
                            config: {},
                            persistant_config: {}
                        }
                    ]
                ]
            };
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(
                mockOrganization as any
            );
            jest.spyOn(analyzersRepository, 'saveAnalyzer').mockResolvedValue(mockAnalyzer);
            jest.spyOn(organizationLoggerService, 'addAuditLog').mockResolvedValue('log-id-123');

            // Act
            const result = await service.create('org-123', complexAnalyzerCreateBody, mockUser);

            // Assert
            expect(result).toBe('analyzer-123');
            expect(analyzersRepository.saveAnalyzer).toHaveBeenCalledWith(
                expect.objectContaining({
                    steps: complexAnalyzerCreateBody.steps
                })
            );
        });
    });

    describe('update', () => {
        it('should update an analyzer successfully', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getAnalyzerById').mockResolvedValue(mockAnalyzer);
            jest.spyOn(analyzersRepository, 'saveAnalyzer').mockResolvedValue(mockAnalyzer);
            jest.spyOn(organizationLoggerService, 'addAuditLog').mockResolvedValue('log-id-123');

            const updateData = {
                ...mockAnalyzerCreateBody,
                name: 'Updated Analyzer',
                description: 'Updated description'
            };

            // Act
            await service.update('org-123', 'analyzer-123', updateData, mockUser);

            // Assert
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
            expect(analyzersRepository.getAnalyzerById).toHaveBeenCalledWith('analyzer-123');
            expect(mockAnalyzer.name).toBe('Updated Analyzer');
            expect(mockAnalyzer.description).toBe('Updated description');
            expect(mockAnalyzer.steps).toEqual(updateData.steps);
            expect(analyzersRepository.saveAnalyzer).toHaveBeenCalledWith(mockAnalyzer);
            expect(organizationLoggerService.addAuditLog).toHaveBeenCalledWith(
                ActionType.AnalyzerUpdate,
                'The user updated an analyzer Updated Analyzer in the organization.',
                'org-123',
                'user-123'
            );
        });

        it('should require ADMIN role for update', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(
                service.update('org-123', 'analyzer-123', mockAnalyzerCreateBody, mockUser)
            ).rejects.toThrow(unauthorizedError);
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
        });

        it('should handle analyzer not found error', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            const entityNotFoundError = new Error('EntityNotFound');
            jest.spyOn(analyzersRepository, 'getAnalyzerById').mockRejectedValue(
                entityNotFoundError
            );

            // Act & Assert
            await expect(
                service.update('org-123', 'analyzer-123', mockAnalyzerCreateBody, mockUser)
            ).rejects.toThrow(entityNotFoundError);
        });
    });

    describe('get', () => {
        it('should retrieve an analyzer successfully', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'doesAnalyzerBelongToOrg').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getAnalyzerById').mockResolvedValue(mockAnalyzer);

            // Act
            const result = await service.get('org-123', 'analyzer-123', mockUser);

            // Assert
            expect(result).toEqual(mockAnalyzer);
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(analyzersRepository.doesAnalyzerBelongToOrg).toHaveBeenCalledWith(
                'analyzer-123',
                'org-123'
            );
            expect(analyzersRepository.getAnalyzerById).toHaveBeenCalledWith('analyzer-123');
        });

        it('should require USER role for access', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(service.get('org-123', 'analyzer-123', mockUser)).rejects.toThrow(
                unauthorizedError
            );
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
        });

        it('should validate analyzer belongs to organization', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            const notAuthorizedError = new Error('NotAuthorized');
            jest.spyOn(analyzersRepository, 'doesAnalyzerBelongToOrg').mockRejectedValue(
                notAuthorizedError
            );

            // Act & Assert
            await expect(service.get('org-123', 'analyzer-123', mockUser)).rejects.toThrow(
                notAuthorizedError
            );
            expect(analyzersRepository.doesAnalyzerBelongToOrg).toHaveBeenCalledWith(
                'analyzer-123',
                'org-123'
            );
        });
    });

    describe('getByName', () => {
        it('should retrieve an analyzer by name successfully', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getByNameAndOrganization').mockResolvedValue(
                mockAnalyzer
            );
            jest.spyOn(analyzersRepository, 'doesAnalyzerBelongToOrg').mockResolvedValue();

            // Act
            const result = await service.getByName('org-123', 'Test Analyzer', mockUser);

            // Assert
            expect(result).toEqual(mockAnalyzer);
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(analyzersRepository.getByNameAndOrganization).toHaveBeenCalledWith(
                'Test Analyzer',
                'org-123'
            );
            expect(analyzersRepository.doesAnalyzerBelongToOrg).toHaveBeenCalledWith(
                'analyzer-123',
                'org-123'
            );
        });

        it('should require USER role for access', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(service.getByName('org-123', 'Test Analyzer', mockUser)).rejects.toThrow(
                unauthorizedError
            );
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
        });

        it('should handle analyzer not found by name', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            const entityNotFoundError = new Error('EntityNotFound');
            jest.spyOn(analyzersRepository, 'getByNameAndOrganization').mockRejectedValue(
                entityNotFoundError
            );

            // Act & Assert
            await expect(
                service.getByName('org-123', 'Non-existent Analyzer', mockUser)
            ).rejects.toThrow(entityNotFoundError);
        });
    });

    describe('getMany', () => {
        it('should retrieve paginated analyzers successfully', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getManyAnalyzers').mockResolvedValue(
                mockPaginatedAnalyzers
            );

            // Act
            const result = await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(result).toEqual(mockPaginatedAnalyzers);
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(analyzersRepository.getManyAnalyzers).toHaveBeenCalledWith('org-123', 0, 10);
        });

        it('should apply pagination limits correctly', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 200, currentPage: -1 }; // Over limit and negative page
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getManyAnalyzers').mockResolvedValue(
                mockPaginatedAnalyzers
            );

            // Act
            await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(analyzersRepository.getManyAnalyzers).toHaveBeenCalledWith('org-123', 0, 100); // Max limit and corrected page
        });

        it('should use default pagination when not provided', async () => {
            // Arrange
            const paginationConfig = {};
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getManyAnalyzers').mockResolvedValue(
                mockPaginatedAnalyzers
            );

            // Act
            await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(analyzersRepository.getManyAnalyzers).toHaveBeenCalledWith('org-123', 0, 10); // Defaults
        });

        it('should handle custom pagination settings', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 25, currentPage: 2 };
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getManyAnalyzers').mockResolvedValue(
                mockPaginatedAnalyzers
            );

            // Act
            await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(analyzersRepository.getManyAnalyzers).toHaveBeenCalledWith('org-123', 2, 25);
        });

        it('should handle currentPage = 0 explicitly', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getManyAnalyzers').mockResolvedValue(
                mockPaginatedAnalyzers
            );

            // Act
            await service.getMany('org-123', paginationConfig, mockUser);

            // Assert
            expect(analyzersRepository.getManyAnalyzers).toHaveBeenCalledWith('org-123', 0, 10);
        });

        it('should require USER role for access', async () => {
            // Arrange
            const paginationConfig = { entriesPerPage: 10, currentPage: 0 };
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(service.getMany('org-123', paginationConfig, mockUser)).rejects.toThrow(
                unauthorizedError
            );
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
        });
    });

    describe('delete', () => {
        it('should delete an analyzer successfully', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'doesAnalyzerBelongToOrg').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'deleteAnalyzer').mockResolvedValue();

            // Act
            await service.delete('org-123', 'analyzer-123', mockUser);

            // Assert
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
            expect(analyzersRepository.doesAnalyzerBelongToOrg).toHaveBeenCalledWith(
                'analyzer-123',
                'org-123'
            );
            expect(analyzersRepository.deleteAnalyzer).toHaveBeenCalledWith('analyzer-123');
        });

        it('should require ADMIN role for deletion', async () => {
            // Arrange
            const unauthorizedError = new Error('NotAuthorized');
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockRejectedValue(
                unauthorizedError
            );

            // Act & Assert
            await expect(service.delete('org-123', 'analyzer-123', mockUser)).rejects.toThrow(
                unauthorizedError
            );
            expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.ADMIN
            );
        });

        it('should validate analyzer belongs to organization before deletion', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            const notAuthorizedError = new Error('NotAuthorized');
            jest.spyOn(analyzersRepository, 'doesAnalyzerBelongToOrg').mockRejectedValue(
                notAuthorizedError
            );

            // Act & Assert
            await expect(service.delete('org-123', 'analyzer-123', mockUser)).rejects.toThrow(
                notAuthorizedError
            );
            expect(analyzersRepository.doesAnalyzerBelongToOrg).toHaveBeenCalledWith(
                'analyzer-123',
                'org-123'
            );
            expect(analyzersRepository.deleteAnalyzer).not.toHaveBeenCalled();
        });

        it('should handle deletion errors', async () => {
            // Arrange
            jest.spyOn(membershipsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'doesAnalyzerBelongToOrg').mockResolvedValue();
            const deletionError = new Error('Foreign key constraint violation');
            jest.spyOn(analyzersRepository, 'deleteAnalyzer').mockRejectedValue(deletionError);

            // Act & Assert
            await expect(service.delete('org-123', 'analyzer-123', mockUser)).rejects.toThrow(
                deletionError
            );
        });
    });
});
