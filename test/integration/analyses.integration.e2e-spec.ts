import { MemberRole } from '../../src/base_modules/organizations/memberships/orgMembership.types';
import { testHelper, type TestUser } from '../utils/integration-test-helper';

describe('Analyses Integration (e2e)', () => {
    let adminUser: TestUser;
    let regularUser: TestUser;
    let projectId: string;
    let analyzerId: string;

    beforeAll(async () => {
        await testHelper.setupTestApp();
    });

    afterAll(async () => {
        await testHelper.teardownTestApp();
    });

    beforeEach(async () => {
        await testHelper.cleanDatabase();

        // Create test users
        adminUser = await testHelper.createTestUser({
            email: 'admin@analyses.com',
            password: 'AdminPassword123!',
            firstName: 'Admin',
            lastName: 'User',
            orgName: 'Analysis Organization',
            role: MemberRole.ADMIN
        });

        regularUser = await testHelper.createTestUser({
            email: 'user@analyses.com',
            password: 'UserPassword123!',
            firstName: 'Regular',
            lastName: 'User',
            orgName: 'Analysis Organization',
            role: MemberRole.USER
        });

        // Create a test project
        const projectResponse = await testHelper.makeAuthenticatedRequest(
            'POST',
            `/organizations/${adminUser.organization.id}/projects`,
            adminUser.accessToken,
            {
                name: 'Analysis Test Project',
                description: 'Project for analysis testing',
                url: 'https://github.com/test/analysis.git',
                branch: 'main'
            }
        );
        projectId = projectResponse.json().data.id;

        // Create a test analyzer
        const analyzerResponse = await testHelper.makeAuthenticatedRequest(
            'POST',
            `/organizations/${adminUser.organization.id}/analyzers`,
            adminUser.accessToken,
            {
                name: 'Test Analyzer',
                description: 'Analyzer for testing',
                steps: [
                    [
                        {
                            name: 'js-sbom',
                            version: '1.0.0',
                            config: {
                                option1: { required: false, default: 'value1' }
                            },
                            persistant_config: {}
                        }
                    ]
                ]
            }
        );
        analyzerId = analyzerResponse.json().data.id;
    });

    describe('POST /organizations/:orgId/projects/:projectId/analyses', () => {
        const analysisData = {
            analyzer_id: '',
            tag: 'v1.0.0',
            branch: 'main',
            commit_hash: 'abc123def456',
            config: {
                'js-sbom': {
                    option1: 'custom-value'
                }
            }
        };

        beforeEach(() => {
            analysisData.analyzer_id = analyzerId;
        });

        it('should create analysis as admin user', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken,
                analysisData
            );

            // Assert
            expect(response.statusCode).toBe(201);
            expect(response.json()).toEqual({
                message: 'Analysis created successfully',
                data: {
                    id: expect.any(String)
                }
            });
        });

        it('should create analysis as regular user', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${regularUser.organization.id}/projects/${projectId}/analyses`,
                regularUser.accessToken,
                analysisData
            );

            // Assert
            expect(response.statusCode).toBe(201);
        });

        it('should validate required analyzer_id', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken,
                { ...analysisData, analyzer_id: '' }
            );

            // Assert
            expect(response.statusCode).toBe(400);
        });

        it('should validate analyzer configuration', async () => {
            // Create analyzer with required config
            const strictAnalyzerResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/analyzers`,
                adminUser.accessToken,
                {
                    name: 'Strict Analyzer',
                    description: 'Analyzer with required config',
                    steps: [
                        [
                            {
                                name: 'strict-step',
                                version: '1.0.0',
                                config: {
                                    required_option: { required: true }
                                },
                                persistant_config: {}
                            }
                        ]
                    ]
                }
            );
            const strictAnalyzerId = strictAnalyzerResponse.json().data.id;

            // Act - Missing required config
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken,
                {
                    ...analysisData,
                    analyzer_id: strictAnalyzerId,
                    config: {} // Missing required config
                }
            );

            // Assert
            expect(response.statusCode).toBe(400);
            expect(response.json().message).toContain('missing config');
        });

        it('should reject analysis for non-existent project', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/non-existent/analyses`,
                adminUser.accessToken,
                analysisData
            );

            // Assert
            expect(response.statusCode).toBe(404);
        });

        it('should reject unauthenticated requests', async () => {
            // Act
            const response = await testHelper.makeRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                analysisData
            );

            // Assert
            expect(response.statusCode).toBe(401);
        });
    });

    describe('GET /organizations/:orgId/projects/:projectId/analyses', () => {
        let analysisIds: string[] = [];

        beforeEach(async () => {
            // Create multiple test analyses
            const analysisPromises = Array(3)
                .fill(null)
                .map((_, index) =>
                    testHelper.makeAuthenticatedRequest(
                        'POST',
                        `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                        adminUser.accessToken,
                        {
                            analyzer_id: analyzerId,
                            tag: `v1.${index}.0`,
                            branch: 'main',
                            commit_hash: `abc123def45${index}`,
                            config: {}
                        }
                    )
                );

            const responses = await Promise.all(analysisPromises);
            analysisIds = responses.map((r) => r.json().data.id);
        });

        it('should retrieve analyses for project members', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                regularUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Analyses retrieved successfully',
                data: {
                    data: expect.arrayContaining([
                        expect.objectContaining({
                            id: analysisIds[0],
                            tag: 'v1.0.0'
                        }),
                        expect.objectContaining({
                            id: analysisIds[1],
                            tag: 'v1.1.0'
                        }),
                        expect.objectContaining({
                            id: analysisIds[2],
                            tag: 'v1.2.0'
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
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses?page=0&entries_per_page=2`,
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

        it('should reject requests for non-existent project', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/non-existent/analyses`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(404);
        });
    });

    describe('GET /organizations/:orgId/projects/:projectId/analyses/:analysisId', () => {
        let analysisId: string;

        beforeEach(async () => {
            // Create a test analysis
            const createResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken,
                {
                    analyzer_id: analyzerId,
                    tag: 'v1.0.0',
                    branch: 'main',
                    commit_hash: 'abc123def456',
                    config: {}
                }
            );
            analysisId = createResponse.json().data.id;
        });

        it('should retrieve analysis details for authorized users', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
                regularUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Analysis retrieved successfully',
                data: {
                    id: analysisId,
                    tag: 'v1.0.0',
                    branch: 'main',
                    commit_hash: 'abc123def456',
                    status: expect.any(String),
                    stage: expect.any(Number),
                    created_on: expect.any(String),
                    created_by: expect.objectContaining({
                        id: adminUser.user.id,
                        email: 'admin@analyses.com'
                    }),
                    analyzer: expect.objectContaining({
                        id: analyzerId,
                        name: 'Test Analyzer'
                    }),
                    project: expect.objectContaining({
                        id: projectId,
                        name: 'Analysis Test Project'
                    })
                }
            });
        });

        it('should return 404 for non-existent analysis', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/non-existent`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(404);
        });
    });

    describe('GET /organizations/:orgId/projects/:projectId/analyses/:analysisId/chart', () => {
        let analysisId: string;

        beforeEach(async () => {
            // Create a test analysis
            const createResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken,
                {
                    analyzer_id: analyzerId,
                    tag: 'v1.0.0',
                    branch: 'main',
                    commit_hash: 'abc123def456',
                    config: {}
                }
            );
            analysisId = createResponse.json().data.id;
        });

        it('should retrieve chart data for analysis', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}/chart`,
                regularUser.accessToken
            );

            // Assert
            // Note: This might return 404 or empty data if analysis hasn't completed
            // Adjust expectations based on your implementation
            expect([200, 404]).toContain(response.statusCode);

            if (response.statusCode === 200) {
                expect(response.json()).toEqual({
                    message: 'Chart data retrieved successfully',
                    data: expect.arrayContaining([
                        expect.objectContaining({
                            x: 'Latest',
                            y: expect.any(String),
                            v: expect.any(Number)
                        })
                    ])
                });
            }
        });
    });

    describe('DELETE /organizations/:orgId/projects/:projectId/analyses/:analysisId', () => {
        let analysisId: string;

        beforeEach(async () => {
            // Create a test analysis
            const createResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken,
                {
                    analyzer_id: analyzerId,
                    tag: 'v1.0.0',
                    branch: 'main',
                    commit_hash: 'abc123def456',
                    config: {}
                }
            );
            analysisId = createResponse.json().data.id;
        });

        it('should delete analysis as admin user', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'DELETE',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Analysis deleted successfully'
            });

            // Verify analysis is deleted
            const getResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
                adminUser.accessToken
            );
            expect(getResponse.statusCode).toBe(404);
        });

        it('should handle deletion of non-existent analysis', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'DELETE',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/non-existent`,
                adminUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(404);
        });
    });

    describe('Analysis Workflow Integration', () => {
        it('should complete full analysis lifecycle', async () => {
            // 1. Create analysis
            const createResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken,
                {
                    analyzer_id: analyzerId,
                    tag: 'v2.0.0',
                    branch: 'develop',
                    commit_hash: 'xyz789abc123',
                    config: {}
                }
            );
            expect(createResponse.statusCode).toBe(201);
            const analysisId = createResponse.json().data.id;

            // 2. Retrieve analysis details
            const getResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
                adminUser.accessToken
            );
            expect(getResponse.statusCode).toBe(200);
            expect(getResponse.json().data.tag).toBe('v2.0.0');

            // 3. List analyses (should include our new analysis)
            const listResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken
            );
            expect(listResponse.statusCode).toBe(200);
            const analyses = listResponse.json().data.data;
            expect(analyses.some((a: any) => a.id === analysisId)).toBe(true);

            // 4. Try to get chart data (might not be available yet)
            const chartResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}/chart`,
                adminUser.accessToken
            );
            // Chart data might not be available for new analysis
            expect([200, 404]).toContain(chartResponse.statusCode);

            // 5. Delete analysis
            const deleteResponse = await testHelper.makeAuthenticatedRequest(
                'DELETE',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
                adminUser.accessToken
            );
            expect(deleteResponse.statusCode).toBe(200);

            // 6. Verify deletion
            const verifyResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses/${analysisId}`,
                adminUser.accessToken
            );
            expect(verifyResponse.statusCode).toBe(404);
        });

        it('should handle multiple concurrent analyses', async () => {
            // Create multiple analyses concurrently
            const analysisPromises = Array(3)
                .fill(null)
                .map((_, index) =>
                    testHelper.makeAuthenticatedRequest(
                        'POST',
                        `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                        adminUser.accessToken,
                        {
                            analyzer_id: analyzerId,
                            tag: `v3.${index}.0`,
                            branch: 'main',
                            commit_hash: `concurrent${index}`,
                            config: {}
                        }
                    )
                );

            const responses = await Promise.all(analysisPromises);

            // All should succeed
            responses.forEach((response) => {
                expect(response.statusCode).toBe(201);
            });

            // Verify all analyses exist
            const listResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                `/organizations/${adminUser.organization.id}/projects/${projectId}/analyses`,
                adminUser.accessToken
            );
            expect(listResponse.statusCode).toBe(200);
            expect(listResponse.json().data.data).toHaveLength(3);
        });
    });
});
