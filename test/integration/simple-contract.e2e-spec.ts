import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Controller, Get, Post, Body, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { APP_PIPE } from '@nestjs/core';

// Simple DTOs for validation testing
class SignupDto {
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    password!: string;

    @IsString()
    first_name!: string;

    @IsString()
    last_name!: string;

    @IsString()
    organization_name!: string;

    @IsString()
    organization_description!: string;
}

class LoginDto {
    @IsEmail()
    email!: string;

    @IsString()
    password!: string;
}

// Simple test controller
@Controller('auth')
class TestAuthController {
    @Post('signup')
    signup(@Body() signupDto: SignupDto) {
        return {
            message: 'User and organization created successfully',
            data: {
                access_token: 'mock-access-token',
                refresh_token: 'mock-refresh-token',
                user: {
                    id: 'user-123',
                    email: signupDto.email,
                    first_name: signupDto.first_name,
                    last_name: signupDto.last_name,
                    email_verified: false,
                    created_on: new Date().toISOString(),
                    updated_on: new Date().toISOString()
                },
                organization: {
                    id: 'org-123',
                    name: signupDto.organization_name,
                    description: signupDto.organization_description,
                    color_scheme: 'blue',
                    personal: false,
                    created_on: new Date().toISOString()
                }
            }
        };
    }

    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return {
            message: 'Login successful',
            data: {
                access_token: 'mock-access-token',
                refresh_token: 'mock-refresh-token',
                user: {
                    id: 'user-123',
                    email: loginDto.email,
                    first_name: 'Test',
                    last_name: 'User',
                    email_verified: true,
                    created_on: new Date().toISOString(),
                    updated_on: new Date().toISOString()
                }
            }
        };
    }

    @Get('profile')
    getProfile() {
        return {
            message: 'Profile retrieved successfully',
            data: {
                id: 'user-123',
                email: 'test@example.com',
                first_name: 'Test',
                last_name: 'User',
                email_verified: true,
                created_on: new Date().toISOString(),
                updated_on: new Date().toISOString()
            }
        };
    }

    @Get('health')
    health() {
        return { status: 'ok', timestamp: new Date().toISOString() };
    }
}

/**
 * Simple Contract Integration Tests
 *
 * These tests validate basic API contract compliance using a simplified test controller.
 * They focus on validation logic and response structure without requiring real services.
 */
describe('Simple Contract Integration (e2e)', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [TestAuthController],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: ValidationPipe
                }
            ]
        }).compile();

        app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
        app.useGlobalPipes(
            new ValidationPipe({
                transform: true,
                whitelist: true,
                forbidNonWhitelisted: true
            })
        );

        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    describe('GET /auth/health', () => {
        it('should return health status', async () => {
            // Act
            const response = await app.inject({
                method: 'GET',
                url: '/auth/health'
            });

            // Assert
            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.payload)).toEqual({
                status: 'ok',
                timestamp: expect.any(String)
            });
        });
    });

    describe('POST /auth/signup validation', () => {
        it('should accept valid signup request', async () => {
            // Arrange
            const signupData = {
                email: 'test@example.com',
                password: 'SecurePassword123!',
                first_name: 'John',
                last_name: 'Doe',
                organization_name: 'Test Org',
                organization_description: 'Test description'
            };

            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/signup',
                payload: signupData
            });

            // Assert
            expect(response.statusCode).toBe(201);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody).toMatchObject({
                message: 'User and organization created successfully',
                data: {
                    access_token: expect.any(String),
                    refresh_token: expect.any(String),
                    user: {
                        id: expect.any(String),
                        email: 'test@example.com',
                        first_name: 'John',
                        last_name: 'Doe',
                        email_verified: false
                    },
                    organization: {
                        id: expect.any(String),
                        name: 'Test Org',
                        description: 'Test description'
                    }
                }
            });
        });

        it('should reject invalid email format', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/signup',
                payload: {
                    email: 'invalid-email',
                    password: 'SecurePassword123!',
                    first_name: 'John',
                    last_name: 'Doe',
                    organization_name: 'Test Org',
                    organization_description: 'Test description'
                }
            });

            // Assert
            expect(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody.message).toEqual(
                expect.arrayContaining([expect.stringContaining('email')])
            );
        });

        it('should reject short password', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/signup',
                payload: {
                    email: 'test@example.com',
                    password: '123',
                    first_name: 'John',
                    last_name: 'Doe',
                    organization_name: 'Test Org',
                    organization_description: 'Test description'
                }
            });

            // Assert
            expect(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody.message).toEqual(
                expect.arrayContaining([expect.stringContaining('password')])
            );
        });

        it('should reject missing required fields', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/signup',
                payload: {
                    email: 'test@example.com'
                    // Missing other required fields
                }
            });

            // Assert
            expect(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody.message).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('password'),
                    expect.stringContaining('first_name'),
                    expect.stringContaining('last_name'),
                    expect.stringContaining('organization_name'),
                    expect.stringContaining('organization_description')
                ])
            );
        });
    });

    describe('POST /auth/login validation', () => {
        it('should accept valid login request', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: {
                    email: 'test@example.com',
                    password: 'password123'
                }
            });

            // Assert
            expect(response.statusCode).toBe(201);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody).toMatchObject({
                message: 'Login successful',
                data: {
                    access_token: expect.any(String),
                    refresh_token: expect.any(String),
                    user: {
                        id: expect.any(String),
                        email: 'test@example.com'
                    }
                }
            });
        });

        it('should reject invalid email in login', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: {
                    email: 'not-an-email',
                    password: 'password'
                }
            });

            // Assert
            expect(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody.message).toEqual(
                expect.arrayContaining([expect.stringContaining('email')])
            );
        });
    });

    describe('Response format validation', () => {
        it('should return consistent error format for validation errors', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/signup',
                payload: {} // Empty payload to trigger validation errors
            });

            // Assert
            expect(response.statusCode).toBe(400);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody).toMatchObject({
                statusCode: 400,
                message: expect.any(Array),
                error: 'Bad Request'
            });
        });

        it('should return 404 for non-existent endpoints', async () => {
            // Act
            const response = await app.inject({
                method: 'GET',
                url: '/auth/non-existent'
            });

            // Assert
            expect(response.statusCode).toBe(404);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody).toMatchObject({
                statusCode: 404,
                message: expect.any(String),
                error: 'Not Found'
            });
        });
    });

    describe('Content-Type handling', () => {
        it('should handle JSON content type correctly', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/login',
                headers: {
                    'content-type': 'application/json'
                },
                payload: JSON.stringify({
                    email: 'test@example.com',
                    password: 'password'
                })
            });

            // Assert
            expect([201, 400]).toContain(response.statusCode);
            expect(response.headers['content-type']).toContain('application/json');
        });

        it('should handle special characters in JSON', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/signup',
                payload: {
                    email: 'test+special@example.com',
                    password: 'P@ssw0rd!#$%',
                    first_name: 'José',
                    last_name: "O'Connor",
                    organization_name: 'Test & Co.',
                    organization_description: 'Description with "quotes" and symbols: <>[]{}|'
                }
            });

            // Assert
            expect(response.statusCode).toBe(201);
            const responseBody = JSON.parse(response.payload);
            expect(responseBody.data.user.first_name).toBe('José');
            expect(responseBody.data.user.last_name).toBe("O'Connor");
        });
    });

    describe('HTTP Methods', () => {
        it('should handle GET requests', async () => {
            // Act
            const response = await app.inject({
                method: 'GET',
                url: '/auth/profile'
            });

            // Assert
            expect(response.statusCode).toBe(200);
            expect(response.headers['content-type']).toContain('application/json');
        });

        it('should handle POST requests', async () => {
            // Act
            const response = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: {
                    email: 'test@example.com',
                    password: 'password'
                }
            });

            // Assert
            expect(response.statusCode).toBe(201);
            expect(response.headers['content-type']).toContain('application/json');
        });

        it('should reject unsupported HTTP methods', async () => {
            // Act
            const response = await app.inject({
                method: 'PATCH',
                url: '/auth/signup'
            });

            // Assert
            expect([404, 405]).toContain(response.statusCode);
        });
    });
});
