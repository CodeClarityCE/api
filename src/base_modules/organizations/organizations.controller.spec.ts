import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationLoggerService } from './log/organizationLogger.service';
import { AuthenticatedUser, ROLE } from '../auth/auth.types';
import { Organization } from './organization.entity';
import { OrganizationCreateBody } from './org.types';
import { SortDirection } from '../../types/sort.types';
import {
    EntityNotFound,
    NotAuthorized,
    NotAuthenticated,
    CannotLeaveAsOwner,
    PersonalOrgCannotBeModified
} from '../../types/error.types';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { CombinedAuthGuard } from '../auth/guards/combined.guard';

describe('OrganizationsController', () => {
    let controller: OrganizationsController;
    let organizationsService: jest.Mocked<OrganizationsService>;
    let _organizationLoggerService: jest.Mocked<OrganizationLoggerService>;

    const mockOrganization = {
        id: 'test-org-id',
        name: 'Test Organization',
        description: 'A test organization',
        created_on: new Date(),
        updated_on: new Date()
    } as unknown as Organization;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    beforeEach(async () => {
        const mockOrganizationsService = {
            create: jest.fn(),
            get: jest.fn(),
            getOrgMetaData: jest.fn(),
            getMany: jest.fn(),
            leaveOrg: jest.fn(),
            deleteOrg: jest.fn()
        };

        const mockOrganizationLoggerService = {
            logAction: jest.fn()
        };

        const mockCombinedAuthGuard = {
            canActivate: jest.fn().mockReturnValue(true)
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [OrganizationsController],
            providers: [
                { provide: OrganizationsService, useValue: mockOrganizationsService },
                { provide: OrganizationLoggerService, useValue: mockOrganizationLoggerService },
                { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
                { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } }
            ]
        })
            .overrideGuard(CombinedAuthGuard)
            .useValue(mockCombinedAuthGuard)
            .compile();

        controller = module.get<OrganizationsController>(OrganizationsController);
        organizationsService = module.get(OrganizationsService);
        _organizationLoggerService = module.get(OrganizationLoggerService);
    });

    describe('create', () => {
        it('should create organization successfully', async () => {
            const createBody: OrganizationCreateBody = {
                name: 'New Organization',
                description: 'A new organization',
                color_scheme: '#000000'
            };

            organizationsService.create.mockResolvedValue('new-org-id');

            const result = await controller.create(mockAuthenticatedUser, createBody);

            expect(organizationsService.create).toHaveBeenCalledWith(
                createBody,
                mockAuthenticatedUser
            );
            expect(result).toEqual({ id: 'new-org-id' });
        });

        it('should throw NotAuthenticated when user is not authenticated', async () => {
            const createBody: OrganizationCreateBody = {
                name: 'New Organization',
                description: 'A new organization',
                color_scheme: '#000000'
            };

            organizationsService.create.mockRejectedValue(new NotAuthenticated());

            await expect(controller.create(mockAuthenticatedUser, createBody)).rejects.toThrow(
                NotAuthenticated
            );
        });
    });

    describe('get', () => {
        it('should return organization data', async () => {
            const organizationData = { ...mockOrganization, projects: [] };

            organizationsService.get.mockResolvedValue(organizationData);

            const result = await controller.get(mockAuthenticatedUser, 'test-org-id');

            expect(organizationsService.get).toHaveBeenCalledWith(
                'test-org-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({ data: organizationData });
        });

        it('should throw EntityNotFound when organization does not exist', async () => {
            organizationsService.get.mockRejectedValue(new EntityNotFound());

            await expect(controller.get(mockAuthenticatedUser, 'nonexistent-org')).rejects.toThrow(
                EntityNotFound
            );
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            organizationsService.get.mockRejectedValue(new NotAuthorized());

            await expect(controller.get(mockAuthenticatedUser, 'other-org-id')).rejects.toThrow(
                NotAuthorized
            );
        });
    });

    describe('getMetaData', () => {
        it('should return organization metadata', async () => {
            organizationsService.getOrgMetaData.mockResolvedValue(mockOrganization);

            const result = await controller.getMetaData(mockAuthenticatedUser, 'test-org-id');

            expect(organizationsService.getOrgMetaData).toHaveBeenCalledWith(
                'test-org-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({ data: mockOrganization });
        });

        it('should throw EntityNotFound when organization does not exist', async () => {
            organizationsService.getOrgMetaData.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.getMetaData(mockAuthenticatedUser, 'nonexistent-org')
            ).rejects.toThrow(EntityNotFound);
        });
    });

    describe('getMany', () => {
        it('should return paginated organizations', async () => {
            const paginatedResponse = {
                data: [mockOrganization],
                page: 0,
                entry_count: 1,
                entries_per_page: 10,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            organizationsService.getMany.mockResolvedValue(paginatedResponse);

            const result = await controller.getMany(
                mockAuthenticatedUser,
                0,
                10,
                'search',
                'name',
                SortDirection.ASC
            );

            expect(organizationsService.getMany).toHaveBeenCalledWith(
                { currentPage: 0, entriesPerPage: 10 },
                mockAuthenticatedUser,
                'search',
                'name',
                SortDirection.ASC
            );
            expect(result).toEqual(paginatedResponse);
        });

        it('should use default pagination values when not provided', async () => {
            const paginatedResponse = {
                data: [mockOrganization],
                page: 0,
                entry_count: 1,
                entries_per_page: 0,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            organizationsService.getMany.mockResolvedValue(paginatedResponse);

            const result = await controller.getMany(mockAuthenticatedUser);

            expect(organizationsService.getMany).toHaveBeenCalledWith(
                { currentPage: undefined, entriesPerPage: undefined },
                mockAuthenticatedUser,
                undefined,
                undefined,
                undefined
            );
            expect(result).toEqual(paginatedResponse);
        });
    });

    describe('leaveOrg', () => {
        it('should leave organization successfully', async () => {
            organizationsService.leaveOrg.mockResolvedValue(undefined);

            const result = await controller.leaveOrg(mockAuthenticatedUser, 'test-org-id');

            expect(organizationsService.leaveOrg).toHaveBeenCalledWith(
                'test-org-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({});
        });

        it('should throw CannotLeaveAsOwner when user is the owner', async () => {
            organizationsService.leaveOrg.mockRejectedValue(new CannotLeaveAsOwner());

            await expect(controller.leaveOrg(mockAuthenticatedUser, 'test-org-id')).rejects.toThrow(
                CannotLeaveAsOwner
            );
        });

        it('should throw PersonalOrgCannotBeModified for personal organization', async () => {
            organizationsService.leaveOrg.mockRejectedValue(new PersonalOrgCannotBeModified());

            await expect(
                controller.leaveOrg(mockAuthenticatedUser, 'personal-org-id')
            ).rejects.toThrow(PersonalOrgCannotBeModified);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            organizationsService.leaveOrg.mockRejectedValue(new NotAuthorized());

            await expect(controller.leaveOrg(mockAuthenticatedUser, 'test-org-id')).rejects.toThrow(
                NotAuthorized
            );
        });
    });

    describe('deleteOrg', () => {
        it('should delete organization successfully', async () => {
            organizationsService.deleteOrg.mockResolvedValue(undefined);

            const result = await controller.deleteOrg(mockAuthenticatedUser, 'test-org-id');

            expect(organizationsService.deleteOrg).toHaveBeenCalledWith(
                'test-org-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({});
        });

        it('should throw PersonalOrgCannotBeModified for personal organization', async () => {
            organizationsService.deleteOrg.mockRejectedValue(new PersonalOrgCannotBeModified());

            await expect(
                controller.deleteOrg(mockAuthenticatedUser, 'personal-org-id')
            ).rejects.toThrow(PersonalOrgCannotBeModified);
        });

        it('should throw EntityNotFound when organization does not exist', async () => {
            organizationsService.deleteOrg.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.deleteOrg(mockAuthenticatedUser, 'nonexistent-org')
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            organizationsService.deleteOrg.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.deleteOrg(mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(NotAuthorized);
        });
    });
});
