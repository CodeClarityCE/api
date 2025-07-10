import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectsRepository } from './projects.repository';
import { Project } from './project.entity';
import { EntityNotFound, NotAuthorized, ProjectDoesNotExist } from 'src/types/error.types';

describe('ProjectsRepository', () => {
    let projectsRepository: ProjectsRepository;

    // Mock data
    const mockProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'A test project',
        added_on: new Date('2024-01-01'),
        added_by: { id: 'user-123' } as any,
        organizations: [{ id: 'org-123' }] as any,
        analyses: [],
        files: [],
        integrations: []
    } as unknown as Project;

    const mockProjectRepository = {
        findOne: jest.fn(),
        exists: jest.fn(),
        delete: jest.fn(),
        find: jest.fn(),
        remove: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn()
    };

    // Mock query builder
    const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getCount: jest.fn(),
        getMany: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectsRepository,
                {
                    provide: getRepositoryToken(Project, 'codeclarity'),
                    useValue: mockProjectRepository
                }
            ]
        }).compile();

        projectsRepository = module.get<ProjectsRepository>(ProjectsRepository);

        // Reset mocks
        jest.clearAllMocks();
        mockProjectRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    describe('getProjectById', () => {
        it('should return project when found', async () => {
            // Arrange
            mockProjectRepository.findOne.mockResolvedValue(mockProject);

            // Act
            const result = await projectsRepository.getProjectById('project-123');

            // Assert
            expect(result).toEqual(mockProject);
            expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
                relations: undefined,
                where: { id: 'project-123' }
            });
        });

        it('should return project with relations when specified', async () => {
            // Arrange
            const relations = { organizations: true, analyses: true };
            mockProjectRepository.findOne.mockResolvedValue(mockProject);

            // Act
            const result = await projectsRepository.getProjectById('project-123', relations);

            // Assert
            expect(result).toEqual(mockProject);
            expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
                relations: relations,
                where: { id: 'project-123' }
            });
        });

        it('should throw EntityNotFound when project does not exist', async () => {
            // Arrange
            mockProjectRepository.findOne.mockResolvedValue(null);

            // Act & Assert
            await expect(projectsRepository.getProjectById('non-existent')).rejects.toThrow(
                EntityNotFound
            );
        });
    });

    describe('getProjectByIdAndOrganization', () => {
        it('should return project when found in organization', async () => {
            // Arrange
            mockProjectRepository.findOne.mockResolvedValue(mockProject);

            // Act
            const result = await projectsRepository.getProjectByIdAndOrganization(
                'project-123',
                'org-123'
            );

            // Assert
            expect(result).toEqual(mockProject);
            expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
                where: {
                    id: 'project-123',
                    organizations: {
                        id: 'org-123'
                    }
                },
                relations: undefined
            });
        });

        it('should throw ProjectDoesNotExist when project not found in organization', async () => {
            // Arrange
            mockProjectRepository.findOne.mockResolvedValue(null);

            // Act & Assert
            await expect(
                projectsRepository.getProjectByIdAndOrganization('project-123', 'wrong-org')
            ).rejects.toThrow(ProjectDoesNotExist);
        });

        it('should include relations when specified', async () => {
            // Arrange
            const relations = { analyses: true };
            mockProjectRepository.findOne.mockResolvedValue(mockProject);

            // Act
            const result = await projectsRepository.getProjectByIdAndOrganization(
                'project-123',
                'org-123',
                relations
            );

            // Assert
            expect(result).toEqual(mockProject);
            expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
                where: {
                    id: 'project-123',
                    organizations: {
                        id: 'org-123'
                    }
                },
                relations: relations
            });
        });
    });

    describe('doesProjectBelongToOrg', () => {
        it('should not throw when project belongs to organization', async () => {
            // Arrange
            mockProjectRepository.exists.mockResolvedValue(true);

            // Act & Assert - Should not throw
            await expect(
                projectsRepository.doesProjectBelongToOrg('project-123', 'org-123')
            ).resolves.toBeUndefined();
            expect(mockProjectRepository.exists).toHaveBeenCalledWith({
                relations: {
                    organizations: true
                },
                where: {
                    id: 'project-123',
                    organizations: {
                        id: 'org-123'
                    }
                }
            });
        });

        it('should throw NotAuthorized when project does not belong to organization', async () => {
            // Arrange
            mockProjectRepository.exists.mockResolvedValue(false);

            // Act & Assert
            await expect(
                projectsRepository.doesProjectBelongToOrg('project-123', 'wrong-org')
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('deleteProject', () => {
        it('should delete project successfully', async () => {
            // Arrange
            mockProjectRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            // Act
            await projectsRepository.deleteProject('project-123');

            // Assert
            expect(mockProjectRepository.delete).toHaveBeenCalledWith('project-123');
        });

        it('should handle delete errors', async () => {
            // Arrange
            const error = new Error('Delete failed');
            mockProjectRepository.delete.mockRejectedValue(error);

            // Act & Assert
            await expect(projectsRepository.deleteProject('project-123')).rejects.toThrow(error);
        });
    });

    describe('deleteUserProjects', () => {
        it('should delete all projects added by user', async () => {
            // Arrange
            const userProjects = [mockProject, { ...mockProject, id: 'project-456' }];
            mockProjectRepository.find.mockResolvedValue(userProjects);
            mockProjectRepository.remove.mockResolvedValue(userProjects);

            // Act
            await projectsRepository.deleteUserProjects('user-123');

            // Assert
            expect(mockProjectRepository.find).toHaveBeenCalledWith({
                where: { added_by: { id: 'user-123' } }
            });
            expect(mockProjectRepository.remove).toHaveBeenCalledWith(userProjects);
        });

        it('should handle user with no projects', async () => {
            // Arrange
            mockProjectRepository.find.mockResolvedValue([]);
            mockProjectRepository.remove.mockResolvedValue([]);

            // Act
            await projectsRepository.deleteUserProjects('user-123');

            // Assert
            expect(mockProjectRepository.remove).toHaveBeenCalledWith([]);
        });
    });

    describe('saveProject', () => {
        it('should save and return project', async () => {
            // Arrange
            const updatedProject = { ...mockProject, name: 'Updated Project' };
            mockProjectRepository.save.mockResolvedValue(updatedProject);

            // Act
            const result = await projectsRepository.saveProject(mockProject);

            // Assert
            expect(result).toEqual(updatedProject);
            expect(mockProjectRepository.save).toHaveBeenCalledWith(mockProject);
        });

        it('should handle save errors', async () => {
            // Arrange
            const error = new Error('Save failed');
            mockProjectRepository.save.mockRejectedValue(error);

            // Act & Assert
            await expect(projectsRepository.saveProject(mockProject)).rejects.toThrow(error);
        });
    });

    describe('getManyProjects', () => {
        it('should return paginated projects for organization', async () => {
            // Arrange
            const projects = [mockProject];
            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue(projects);

            // Act
            const result = await projectsRepository.getManyProjects('org-123', 0, 10);

            // Assert
            expect(result).toEqual({
                data: projects,
                page: 0,
                entry_count: 1,
                entries_per_page: 10,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            });
            expect(mockQueryBuilder.where).toHaveBeenCalledWith('organizations.id = :orgId', {
                orgId: 'org-123'
            });
            expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
            expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0);
        });

        it('should apply search filter when searchKey provided', async () => {
            // Arrange
            const projects = [mockProject];
            mockQueryBuilder.getCount.mockResolvedValue(1);
            mockQueryBuilder.getMany.mockResolvedValue(projects);

            // Act
            const result = await projectsRepository.getManyProjects('org-123', 0, 10, 'test');

            // Assert
            expect(result.data).toEqual(projects);
            expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
                '(project.name LIKE :searchKey OR project.description LIKE :searchKey)',
                { searchKey: '%test%' }
            );
        });

        it('should handle pagination correctly', async () => {
            // Arrange
            const projects = Array(5).fill(mockProject);
            mockQueryBuilder.getCount.mockResolvedValue(25);
            mockQueryBuilder.getMany.mockResolvedValue(projects);

            // Act
            const result = await projectsRepository.getManyProjects('org-123', 2, 5);

            // Assert
            expect(result).toEqual({
                data: projects,
                page: 2,
                entry_count: 5,
                entries_per_page: 5,
                total_entries: 25,
                total_pages: 5,
                matching_count: 25,
                filter_count: {}
            });
            expect(mockQueryBuilder.limit).toHaveBeenCalledWith(5);
            expect(mockQueryBuilder.offset).toHaveBeenCalledWith(10); // page 2 * 5 entries
        });

        it('should handle empty results', async () => {
            // Arrange
            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            // Act
            const result = await projectsRepository.getManyProjects('org-123', 0, 10);

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

        it('should include all required joins', async () => {
            // Arrange
            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            // Act
            await projectsRepository.getManyProjects('org-123', 0, 10);

            // Assert
            expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
                'project.organizations',
                'organizations'
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'project.analyses',
                'analyses'
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'analyses.analyzer',
                'analyzer'
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'project.files',
                'files'
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'project.added_by',
                'added_by'
            );
            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('analyses.created_on', 'DESC');
        });
    });
});
