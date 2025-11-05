import type { TestUser } from '../utils/integration-test-helper';
import { testHelper } from '../utils/integration-test-helper';
// Note: These tests use direct object structures since the current API
// doesn't have signup endpoints that match the test scenarios

describe('Authentication Integration (e2e)', () => {
    beforeAll(async () => {
        await testHelper.setupTestApp();
    });

    afterAll(async () => {
        await testHelper.teardownTestApp();
    });

    beforeEach(async () => {
        await testHelper.cleanDatabase();
    });

    describe('POST /auth/signup', () => {
        it('should successfully register a new user and organization', async () => {
            // Arrange
            const signupData = {
                email: 'newuser@example.com',
                password: 'SecurePassword123!',
                first_name: 'John',
                last_name: 'Doe',
                organization_name: 'Acme Corp',
                organization_description: 'A test organization'
            };

            // Act
            const response = await testHelper.makeRequest('POST', '/auth/signup', signupData);

            // Assert
            expect(response.statusCode).toBe(201);
            expect(response.json()).toEqual({
                message: 'User and organization created successfully',
                data: {
                    access_token: expect.any(String),
                    refresh_token: expect.any(String),
                    user: {
                        id: expect.any(String),
                        email: 'newuser@example.com',
                        first_name: 'John',
                        last_name: 'Doe',
                        email_verified: false,
                        created_on: expect.any(String),
                        updated_on: expect.any(String)
                    },
                    organization: {
                        id: expect.any(String),
                        name: 'Acme Corp',
                        description: 'A test organization',
                        color_scheme: expect.any(String),
                        personal: false,
                        created_on: expect.any(String)
                    }
                }
            });
        });

        it('should reject signup with invalid email', async () => {
            // Arrange
            const signupData = {
                email: 'invalid-email',
                password: 'SecurePassword123!',
                first_name: 'John',
                last_name: 'Doe',
                organization_name: 'Acme Corp',
                organization_description: 'A test organization'
            };

            // Act
            const response = await testHelper.makeRequest('POST', '/auth/signup', signupData);

            // Assert
            expect(response.statusCode).toBe(400);
            expect(response.json().message).toContain('email must be an email');
        });

        it('should reject signup with weak password', async () => {
            // Arrange
            const signupData = {
                email: 'test@example.com',
                password: '123',
                first_name: 'John',
                last_name: 'Doe',
                organization_name: 'Acme Corp',
                organization_description: 'A test organization'
            };

            // Act
            const response = await testHelper.makeRequest('POST', '/auth/signup', signupData);

            // Assert
            expect(response.statusCode).toBe(400);
            expect(response.json().message).toContain('password');
        });

        it('should reject signup with duplicate email', async () => {
            // Arrange
            const signupData = {
                email: 'duplicate@example.com',
                password: 'SecurePassword123!',
                first_name: 'John',
                last_name: 'Doe',
                organization_name: 'Acme Corp',
                organization_description: 'A test organization'
            };

            // Create first user
            await testHelper.makeRequest('POST', '/auth/signup', signupData);

            // Act - Try to create duplicate
            const response = await testHelper.makeRequest('POST', '/auth/signup', signupData);

            // Assert
            expect(response.statusCode).toBe(409);
            expect(response.json().message).toContain('already exists');
        });
    });

    describe('POST /auth/login', () => {
        let testUser: TestUser;

        beforeEach(async () => {
            testUser = await testHelper.createTestUser({
                email: 'login@example.com',
                password: 'LoginPassword123!'
            });
        });

        it('should successfully login with valid credentials', async () => {
            // Arrange
            const loginData = {
                email: 'login@example.com',
                password: 'LoginPassword123!'
            };

            // Act
            const response = await testHelper.makeRequest('POST', '/auth/login', loginData);

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Login successful',
                data: {
                    access_token: expect.any(String),
                    refresh_token: expect.any(String),
                    user: {
                        id: testUser.user.id,
                        email: 'login@example.com',
                        first_name: 'Test',
                        last_name: 'User',
                        email_verified: true,
                        created_on: expect.any(String),
                        updated_on: expect.any(String)
                    }
                }
            });
        });

        it('should reject login with invalid email', async () => {
            // Arrange
            const loginData = {
                email: 'nonexistent@example.com',
                password: 'LoginPassword123!'
            };

            // Act
            const response = await testHelper.makeRequest('POST', '/auth/login', loginData);

            // Assert
            expect(response.statusCode).toBe(401);
            expect(response.json().message).toContain('Invalid credentials');
        });

        it('should reject login with invalid password', async () => {
            // Arrange
            const loginData = {
                email: 'login@example.com',
                password: 'WrongPassword'
            };

            // Act
            const response = await testHelper.makeRequest('POST', '/auth/login', loginData);

            // Assert
            expect(response.statusCode).toBe(401);
            expect(response.json().message).toContain('Invalid credentials');
        });

        it('should reject login with malformed request', async () => {
            // Arrange
            const loginData = {
                email: 'not-an-email',
                password: ''
            };

            // Act
            const response = await testHelper.makeRequest('POST', '/auth/login', loginData);

            // Assert
            expect(response.statusCode).toBe(400);
        });
    });

    describe('GET /auth/profile', () => {
        let testUser: TestUser;

        beforeEach(async () => {
            testUser = await testHelper.createTestUser({
                email: 'profile@example.com',
                password: 'ProfilePassword123!'
            });
        });

        it('should return user profile with valid token', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                '/auth/profile',
                testUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Profile retrieved successfully',
                data: {
                    id: testUser.user.id,
                    email: 'profile@example.com',
                    first_name: 'Test',
                    last_name: 'User',
                    email_verified: true,
                    created_on: expect.any(String),
                    updated_on: expect.any(String)
                }
            });
        });

        it('should reject request without token', async () => {
            // Act
            const response = await testHelper.makeRequest('GET', '/auth/profile');

            // Assert
            expect(response.statusCode).toBe(401);
            expect(response.json().message).toContain('Unauthorized');
        });

        it('should reject request with invalid token', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                '/auth/profile',
                'invalid-token'
            );

            // Assert
            expect(response.statusCode).toBe(401);
            expect(response.json().message).toContain('Unauthorized');
        });

        it('should reject request with expired token', async () => {
            // This would require mocking JWT expiration or using a short-lived token
            // For now, we'll test with a malformed token that looks expired
            const expiredToken =
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';

            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'GET',
                '/auth/profile',
                expiredToken
            );

            // Assert
            expect(response.statusCode).toBe(401);
        });
    });

    describe('POST /auth/refresh', () => {
        let testUser: TestUser;

        beforeEach(async () => {
            testUser = await testHelper.createTestUser({
                email: 'refresh@example.com',
                password: 'RefreshPassword123!'
            });
        });

        it('should refresh tokens with valid refresh token', async () => {
            // Act
            const response = await testHelper.makeRequest('POST', '/auth/refresh', {
                refresh_token: testUser.refreshToken
            });

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Tokens refreshed successfully',
                data: {
                    access_token: expect.any(String),
                    refresh_token: expect.any(String)
                }
            });

            // Verify new tokens are different from original
            const newTokens = response.json().data;
            expect(newTokens.access_token).not.toBe(testUser.accessToken);
            expect(newTokens.refresh_token).not.toBe(testUser.refreshToken);
        });

        it('should reject refresh with invalid refresh token', async () => {
            // Act
            const response = await testHelper.makeRequest('POST', '/auth/refresh', {
                refresh_token: 'invalid-refresh-token'
            });

            // Assert
            expect(response.statusCode).toBe(401);
            expect(response.json().message).toContain('Invalid refresh token');
        });

        it('should reject refresh without refresh token', async () => {
            // Act
            const response = await testHelper.makeRequest('POST', '/auth/refresh', {});

            // Assert
            expect(response.statusCode).toBe(400);
            expect(response.json().message).toContain('refresh_token');
        });
    });

    describe('POST /auth/logout', () => {
        let testUser: TestUser;

        beforeEach(async () => {
            testUser = await testHelper.createTestUser({
                email: 'logout@example.com',
                password: 'LogoutPassword123!'
            });
        });

        it('should successfully logout with valid token', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                '/auth/logout',
                testUser.accessToken
            );

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                message: 'Logout successful'
            });
        });

        it('should reject logout without token', async () => {
            // Act
            const response = await testHelper.makeRequest('POST', '/auth/logout');

            // Assert
            expect(response.statusCode).toBe(401);
            expect(response.json().message).toContain('Unauthorized');
        });

        it('should handle logout with invalid token gracefully', async () => {
            // Act
            const response = await testHelper.makeAuthenticatedRequest(
                'POST',
                '/auth/logout',
                'invalid-token'
            );

            // Assert
            expect(response.statusCode).toBe(401);
        });
    });

    describe('Authentication Flow Integration', () => {
        it('should complete full authentication lifecycle', async () => {
            // 1. Sign up
            const signupData = {
                email: 'lifecycle@example.com',
                password: 'LifecyclePassword123!',
                first_name: 'Life',
                last_name: 'Cycle',
                organization_name: 'Lifecycle Corp',
                organization_description: 'Test lifecycle'
            };

            const signupResponse = await testHelper.makeRequest('POST', '/auth/signup', signupData);
            expect(signupResponse.statusCode).toBe(201);

            const { access_token, refresh_token } = signupResponse.json().data;

            // 2. Access protected resource
            const profileResponse = await testHelper.makeAuthenticatedRequest(
                'GET',
                '/auth/profile',
                access_token
            );
            expect(profileResponse.statusCode).toBe(200);
            expect(profileResponse.json().data.email).toBe('lifecycle@example.com');

            // 3. Refresh tokens
            const refreshResponse = await testHelper.makeRequest('POST', '/auth/refresh', {
                refresh_token
            });
            expect(refreshResponse.statusCode).toBe(200);

            const newAccessToken = refreshResponse.json().data.access_token;

            // 4. Use new token
            const profileResponse2 = await testHelper.makeAuthenticatedRequest(
                'GET',
                '/auth/profile',
                newAccessToken
            );
            expect(profileResponse2.statusCode).toBe(200);

            // 5. Logout
            const logoutResponse = await testHelper.makeAuthenticatedRequest(
                'POST',
                '/auth/logout',
                newAccessToken
            );
            expect(logoutResponse.statusCode).toBe(200);

            // 6. Verify token is invalidated (if implemented)
            // Note: This depends on whether token blacklisting is implemented
            // const profileResponse3 = await testHelper.makeAuthenticatedRequest(
            //     'GET',
            //     '/auth/profile',
            //     newAccessToken
            // );
            // expect(profileResponse3.statusCode).toBe(401);
        });

        it('should handle concurrent authentication requests', async () => {
            // Create multiple concurrent signup requests
            const signupPromises = Array(5)
                .fill(null)
                .map((_, index) =>
                    testHelper.makeRequest('POST', '/auth/signup', {
                        email: `concurrent${index}@example.com`,
                        password: 'ConcurrentPassword123!',
                        first_name: 'Concurrent',
                        last_name: `User${index}`,
                        organization_name: `Concurrent Corp ${index}`,
                        organization_description: `Test concurrent ${index}`
                    })
                );

            const responses = await Promise.all(signupPromises);

            // All requests should succeed
            responses.forEach((response, index) => {
                expect(response.statusCode).toBe(201);
                expect(response.json().data.user.email).toBe(`concurrent${index}@example.com`);
            });
        });
    });
});
