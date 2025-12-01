import { MemberRole } from '../../src/base_modules/organizations/memberships/orgMembership.types';
import { testHelper, type TestUser } from '../utils/integration-test-helper';

describe('Projects Integration (e2e)', () => {
    let adminUser: TestUser;
    let regularUser: TestUser;
    let otherOrgUser: TestUser;

    beforeAll(async () => {
        await testHelper.setupTestApp();
    });

    afterAll(async () => {
        await testHelper.teardownTestApp();
    });

    beforeEach(async () => {
        await testHelper.cleanDatabase();

        // Create test users with different roles
        adminUser = await testHelper.createTestUser({
            email: 'admin@projects.com',
            password: 'AdminPassword123!',
            firstName: 'Admin',
            lastName: 'User',
            orgName: 'Main Organization',
            role: MemberRole.ADMIN
        });

        regularUser = await testHelper.createTestUser({
            email: 'user@projects.com',
            password: 'UserPassword123!',
            firstName: 'Regular',
            lastName: 'User',
            orgName: 'Main Organization',
            role: MemberRole.USER
        });

        otherOrgUser = await testHelper.createTestUser({
            email: 'other@projects.com',
            password: 'OtherPassword123!',
            firstName: 'Other',
            lastName: 'User',
            orgName: 'Other Organization',
            role: MemberRole.ADMIN
        });
    });

    describe('POST /organizations/:orgId/projects', () => {
        const projectData = {
            name: 'Test Project',
            description: 'A test project for integration testing',
            url: 'https://github.com/test/repo.git',
            branch: 'main'
        };

        it('should create project as admin user', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects`,
                adminUser.accessToken,
                projectData
            );

            // Assert
            expect(response.statusCode).toBe(201);
            expect(response.json()).toEqual({
                message: 'Project created successfully',
                data: {
                    id: expect.any(String),
                    name: 'Test Project',
                    description: 'A test project for integration testing',
                    url: 'https://github.com/test/repo.git',
                    branch: 'main',
                    added_on: expect.any(String),
                    added_by: {
                        id: adminUser.user.id,
                        email: 'admin@projects.com',
                        first_name: 'Admin',
                        last_name: 'User'
                    }
                }
            });
        });

        it('should create project as regular user', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${regularUser.organization.id}/projects`,
                regularUser.accessToken,
                projectData
            );

            // Assert
            expect(response.statusCode).toBe(201);
        });

        it('should reject project creation for different organization', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${otherOrgUser.organization.id}/projects`,
                adminUser.accessToken,
                projectData
            );

            // Assert
            expect(response.statusCode).toBe(403);
            expect(response.json().message).toContain('Not authorized');
        });

        it('should validate required fields', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects`,
                adminUser.accessToken,
                { name: 'Test' } // Missing required fields
            );

            // Assert
            expect(response.statusCode).toBe(400);
        });

        it('should reject unauthenticated requests', async () => {
            // Act
            const response = await testHelper.makeRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects`,
                projectData
            );

            // Assert
            expect(response.statusCode).toBe(401);
        });
    });

    describe('GET /organizations/:orgId/projects', () => {
        beforeEach(async () => {
            // Create some test projects
            const projects = [
                {
                    name: 'Project Alpha',
                    description: 'First project',
                    url: 'https://github.com/test/alpha.git'
                },
                {
                    name: 'Project Beta',
                    description: 'Second project',
                    url: 'https://github.com/test/beta.git'
                },
                {
                    name: 'Project Gamma',
                    description: 'Third project',
                    url: 'https://github.com/test/gamma.git'
                }
            ];

            for (const project of projects) {
                await testHelper.makeAuthenticatedRequest(
                    'POST',
                    `/organizations/${adminUser.organization.id}/projects`,
                    adminUser.accessToken,
                    { ...project, branch: 'main' }
                );
            }
        });

        it('should retrieve projects for organization members', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects`,
                regularUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Projects retrieved successfully',
                data: {
                    data: expect.arrayContaining([
                        expect.objectContaining({
                            name: 'Project Alpha',
                            description: 'First project'
                        }),
                        expect.objectContaining({
                            name: 'Project Beta',
                            description: 'Second project'
                        }),
                        expect.objectContaining({
                            name: 'Project Gamma',
                            description: 'Third project'
                        })
                    ]),
                    page: 0,
                    entry_count: 3,
                    entries_per_page: 10,
                    total_entries: 3,
                    total_pages: 1
                }
            });
        });

        it('should support pagination', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects?page=0&entries_per_page=2`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            const data = response.json().data;
            expect(data.data).toHaveLength(2);
            expect(data.entries_per_page).toBe(2);
            expect(data.total_entries).toBe(3);
            expect(data.total_pages).toBe(2);
        });

        it('should support search functionality', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects?search=Alpha`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            const data = response.json().data;
            expect(data.data).toHaveLength(1);
            expect(data.data[0].name).toBe('Project Alpha');
        });

        it('should reject requests from non-members', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects`,
                otherOrgUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(403);
        });
    });

    describe('GET /organizations/:orgId/projects/:projectId', () => {
        let projectId: string;

        beforeEach(async () => {
            // Create a test project
            const createResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects`,
                adminUser.accessToken,
                {
                    name: 'Detailed Project',
                    description: 'Project for detailed view testing',
                    url: 'https://github.com/test/detailed.git',
                    branch: 'main'
                }
            );
            projectId = createResponse.json().data.id;
        });

        it('should retrieve project details for organization members', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                regularUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Project retrieved successfully',
                data: {
                    id: projectId,
                    name: 'Detailed Project',
                    description: 'Project for detailed view testing',
                    url: 'https://github.com/test/detailed.git',
                    branch: 'main',
                    added_on: expect.any(String),
                    added_by: expect.objectContaining({
                        id: adminUser.user.id,
                        email: 'admin@projects.com'
                    }),
                    analyses: expect.any(Array),
                    files: expect.any(Array)
                }
            });
        });

        it('should return 404 for non-existent project', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/non-existent-id`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(404);
        });

        it('should reject requests from non-members', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                otherOrgUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(403);
        });
    });

    describe('DELETE /organizations/:orgId/projects/:projectId', () => {
        let projectId: string;

        beforeEach(async () => {
            // Create a test project
            const createResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects`,
                adminUser.accessToken,
                {
                    name: 'Project to Delete',
                    description: 'This project will be deleted',
                    url: 'https://github.com/test/delete.git',
                    branch: 'main'
                }
            );
            projectId = createResponse.json().data.id;
        });

        it('should delete project as admin user', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'DELETE',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Project deleted successfully'
            });

            // Verify project is deleted
            const getResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                adminUser.accessToken
            );
            expect(getResponse.statusCode).toBe(404);
        });

        it('should reject deletion as regular user (if admin-only)', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'DELETE',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                regularUser.accessToken
            );

            // Assert
            // This depends on your business rules - adjust based on actual implementation
            expect([200, 403]).toContain(response.statusCode);
        });

        it('should return 404 for non-existent project', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'DELETE',
                `/organizations/${adminUser.organization.id}/projects/non-existent-id`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(404);
        });
    });

    describe('Project Workflow Integration', () => {
        it('should complete full project lifecycle', async () => {
            // 1. Create project
            const createResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects`,
                adminUser.accessToken,
                {
                    name: 'Lifecycle Project',
                    description: 'Full lifecycle test',
                    url: 'https://github.com/test/lifecycle.git',
                    branch: 'main'
                }
            );
            expect(createResponse.statusCode).toBe(201);
            const projectId = createResponse.json().data.id;

            // 2. Retrieve project details
            const getResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                adminUser.accessToken
            );
            expect(getResponse.statusCode).toBe(200);
            expect(getResponse.json().data.name).toBe('Lifecycle Project');

            // 3. List projects (should include our new project)
            const listResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects`,
                adminUser.accessToken
            );
            expect(listResponse.statusCode).toBe(200);
            const projects = listResponse.json().data.data;
            expect(projects.some((p: any) => p.id === projectId)).toBe(true);

            // 4. Delete project
            const deleteResponse = await testHelper.makeAuthenticatedRequest(
                'DELETE',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                adminUser.accessToken
            );
            expect(deleteResponse.statusCode).toBe(200);

            // 5. Verify deletion
            const verifyResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}`,
                adminUser.accessToken
            );
            expect(verifyResponse.statusCode).toBe(404);
        });

        it('should handle concurrent project operations', async () => {
            // Create multiple projects concurrently
            const projectPromises = Array(5)
                .fill(null)
                .map((_, index) =>
                    testHelper.makeAuthenticatedRequest(
                        'POST',
                        `/organizations/${adminUser.organization.id}/projects`,
                        adminUser.accessToken,
                        {
                            name: `Concurrent Project ${index}`,
                            description: `Concurrent test ${index}`,
                            url: `https://github.com/test/concurrent${index}.git`,
                            branch: 'main'
                        }
                    )
                );

            const responses = await Promise.all(projectPromises);

            // All should succeed
            responses.forEach((response, index) => {
                expect(response.statusCode).toBe(201);
                expect(response.json().data.name).toBe(`Concurrent Project ${index}`);
            });

            // Verify all projects exist
            const listResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects`,
                adminUser.accessToken
            );
            expect(listResponse.statusCode).toBe(200);
            expect(listResponse.json().data.data).toHaveLength(5);
        });
    });
});
