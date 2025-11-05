import { Test, type TestingModule } from '@nestjs/testing';

import { EntityNotFound, NotAuthorized, AlreadyExists } from '../../types/error.types';
import { SortDirection } from '../../types/sort.types';
import { AuthenticatedUser, ROLE } from '../auth/auth.types';

import type { Project } from './project.entity';
import type { ProjectImportBody } from './project.types';
import { ProjectController } from './projects.controller';
import { ProjectService, AllowedOrderByGetProjects } from './projects.service';


describe('ProjectController', () => {
    let controller: ProjectController;
    let projectsService: jest.Mocked<ProjectService>;

    const mockProject = {
        id: 'test-project-id',
        name: 'Test Project',
        description: 'A test project',
        url: 'https://github.com/test/project',
        created_on: new Date(),
        updated_on: new Date()
    } as unknown as Project;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    beforeEach(async () => {
        const mockProjectsService = {
            import: jest.fn(),
            get: jest.fn(),
            getMany: jest.fn(),
            delete: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ProjectController],
            providers: [{ provide: ProjectService, useValue: mockProjectsService }]
        }).compile();

        controller = module.get<ProjectController>(ProjectController);
        projectsService = module.get(ProjectService);
    });

    describe('import', () => {
        it('should import project successfully', async () => {
            const importBody: ProjectImportBody = {
                name: 'New Project',
                description: 'A new project',
                url: 'https://github.com/test/new-project',
                integration_id: 'test-integration-id'
            };

            projectsService.import.mockResolvedValue('new-project-id');

            const result = await controller.import(
                importBody,
                mockAuthenticatedUser,
                'test-org-id'
            );

            expect(projectsService.import).toHaveBeenCalledWith(
                'test-org-id',
                importBody,
                mockAuthenticatedUser
            );
            expect(result).toEqual({ id: 'new-project-id' });
        });

        it('should throw AlreadyExists when project already exists', async () => {
            const importBody: ProjectImportBody = {
                name: 'Existing Project',
                description: 'An existing project',
                url: 'https://github.com/test/existing-project',
                integration_id: 'test-integration-id'
            };

            projectsService.import.mockRejectedValue(new AlreadyExists());

            await expect(
                controller.import(importBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(AlreadyExists);
        });

        it('should throw EntityNotFound when organization does not exist', async () => {
            const importBody: ProjectImportBody = {
                name: 'New Project',
                description: 'A new project',
                url: 'https://github.com/test/new-project',
                integration_id: 'test-integration-id'
            };

            projectsService.import.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.import(importBody, mockAuthenticatedUser, 'nonexistent-org')
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            const importBody: ProjectImportBody = {
                name: 'New Project',
                description: 'A new project',
                url: 'https://github.com/test/new-project',
                integration_id: 'test-integration-id'
            };

            projectsService.import.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.import(importBody, mockAuthenticatedUser, 'test-org-id')
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('get', () => {
        it('should return project data', async () => {
            projectsService.get.mockResolvedValue(mockProject);

            const result = await controller.get(
                mockAuthenticatedUser,
                'test-project-id',
                'test-org-id'
            );

            expect(projectsService.get).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({ data: mockProject });
        });

        it('should throw EntityNotFound when project does not exist', async () => {
            projectsService.get.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.get(mockAuthenticatedUser, 'nonexistent-project', 'test-org-id')
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            projectsService.get.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.get(mockAuthenticatedUser, 'test-project-id', 'test-org-id')
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('getMany', () => {
        it('should return paginated projects', async () => {
            const paginatedResponse = {
                data: [mockProject],
                page: 0,
                entry_count: 1,
                entries_per_page: 10,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            projectsService.getMany.mockResolvedValue(paginatedResponse);

            const result = await controller.getMany(
                mockAuthenticatedUser,
                'test-org-id',
                0,
                10,
                'search',
                AllowedOrderByGetProjects.NAME,
                SortDirection.ASC
            );

            expect(projectsService.getMany).toHaveBeenCalledWith(
                'test-org-id',
                { currentPage: 0, entriesPerPage: 10 },
                mockAuthenticatedUser,
                'search',
                AllowedOrderByGetProjects.NAME,
                SortDirection.ASC
            );
            expect(result).toEqual(paginatedResponse);
        });

        it('should use default pagination values when not provided', async () => {
            const paginatedResponse = {
                data: [mockProject],
                page: 0,
                entry_count: 1,
                entries_per_page: 0,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            projectsService.getMany.mockResolvedValue(paginatedResponse);

            const result = await controller.getMany(mockAuthenticatedUser, 'test-org-id');

            expect(projectsService.getMany).toHaveBeenCalledWith(
                'test-org-id',
                { currentPage: 0, entriesPerPage: 0 },
                mockAuthenticatedUser,
                undefined,
                undefined,
                undefined
            );
            expect(result).toEqual(paginatedResponse);
        });

        it('should throw NotAuthorized when user lacks permission to access organization', async () => {
            projectsService.getMany.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.getMany(mockAuthenticatedUser, 'unauthorized-org')
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('delete', () => {
        it('should delete project successfully', async () => {
            projectsService.delete.mockResolvedValue(undefined);

            const result = await controller.delete(
                mockAuthenticatedUser,
                'test-project-id',
                'test-org-id'
            );

            expect(projectsService.delete).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({});
        });

        it('should throw EntityNotFound when project does not exist', async () => {
            projectsService.delete.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.delete(mockAuthenticatedUser, 'nonexistent-project', 'test-org-id')
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            projectsService.delete.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.delete(mockAuthenticatedUser, 'test-project-id', 'test-org-id')
            ).rejects.toThrow(NotAuthorized);
        });
    });
});
