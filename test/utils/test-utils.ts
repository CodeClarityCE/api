import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * Test utilities for setting up NestJS applications and modules
 */
export class TestUtils {
    /**
     * Create a test database configuration
     */
    static getTestDatabaseConfig() {
        return {
            type: 'postgres' as const,
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            username: process.env.DB_USERNAME || 'testuser',
            password: process.env.DB_PASSWORD || 'testpass',
            database: process.env.DB_NAME || 'codeclarity_test',
            entities: ['src/**/*.entity.ts'],
            synchronize: true,
            dropSchema: true,
            logging: false
        };
    }

    /**
     * Create a test module with common mocks
     */
    static async createTestModule(
        module: any,
        providers: any[] = [],
        imports: any[] = []
    ): Promise<TestingModule> {
        const allProviders = [
            ...providers,
            {
                provide: ConfigService,
                useValue: {
                    get: jest.fn((key: string) => {
                        const config = {
                            JWT_SECRET: 'test_jwt_secret',
                            JWT_EXPIRATION_TIME: '1h',
                            MAIL_HOST: 'localhost',
                            MAIL_PORT: 1025,
                            MAIL_USER: 'test',
                            MAIL_PASSWORD: 'test',
                            MAIL_FROM: 'test@codeclarity.io'
                        };
                        return config[key as keyof typeof config];
                    })
                }
            }
        ];

        if (module) {
            allProviders.push(module);
        }

        const moduleBuilder = Test.createTestingModule({
            imports: [TypeOrmModule.forRoot(this.getTestDatabaseConfig()), ...imports],
            providers: allProviders
        });

        return moduleBuilder.compile();
    }

    /**
     * Create a test application
     */
    static async createTestApp(module: any): Promise<INestApplication> {
        const moduleFixture = await Test.createTestingModule({
            imports: [module]
        }).compile();

        const app = moduleFixture.createNestApplication();
        await app.init();
        return app;
    }

    /**
     * Generate a test JWT token
     */
    static generateTestToken(payload: any = { userId: 1, email: 'test@example.com' }): string {
        const jwtService = new JwtService({ secret: 'test_jwt_secret' });
        return jwtService.sign(payload);
    }

    /**
     * Clean up test database
     */
    static async cleanDatabase(repositories: Repository<any>[]): Promise<void> {
        for (const repository of repositories) {
            await repository.clear();
        }
    }
}

/**
 * Mock factories for common entities
 */
export class MockFactory {
    /**
     * Create a mock user
     */
    static createMockUser(overrides: Partial<any> = {}) {
        return {
            id: 1,
            email: 'test@example.com',
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        };
    }

    /**
     * Create a mock organization
     */
    static createMockOrganization(overrides: Partial<any> = {}) {
        return {
            id: 1,
            name: 'Test Organization',
            description: 'Test organization description',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        };
    }

    /**
     * Create a mock project
     */
    static createMockProject(overrides: Partial<any> = {}) {
        return {
            id: 1,
            name: 'Test Project',
            description: 'Test project description',
            repository: 'https://github.com/test/repo',
            organizationId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        };
    }

    /**
     * Create a mock analysis
     */
    static createMockAnalysis(overrides: Partial<any> = {}) {
        return {
            id: 1,
            uuid: 'test-uuid-123',
            projectId: 1,
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        };
    }
}

/**
 * Common test data and constants
 */
export const TEST_DATA = {
    VALID_EMAIL: 'test@example.com',
    INVALID_EMAIL: 'invalid-email',
    VALID_PASSWORD: 'StrongPassword123!',
    WEAK_PASSWORD: '123',
    TEST_JWT_SECRET: 'test_jwt_secret_key_for_testing_only',
    TEST_API_KEY: 'test-api-key-123'
};

/**
 * Test assertion helpers
 */
export class TestAssertions {
    /**
     * Assert that an object has the expected structure
     */
    static assertObjectStructure(obj: any, expectedKeys: string[]): void {
        expect(obj).toBeDefined();
        expect(typeof obj).toBe('object');
        expectedKeys.forEach((key) => {
            expect(obj).toHaveProperty(key);
        });
    }

    /**
     * Assert that a response has pagination structure
     */
    static assertPaginationStructure(response: any): void {
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('meta');
        expect(response.meta).toHaveProperty('total');
        expect(response.meta).toHaveProperty('page');
        expect(response.meta).toHaveProperty('limit');
        expect(Array.isArray(response.data)).toBe(true);
    }

    /**
     * Assert that an error response has the expected structure
     */
    static assertErrorResponse(
        response: any,
        expectedStatus: number,
        expectedMessage?: string
    ): void {
        expect(response).toHaveProperty('statusCode', expectedStatus);
        expect(response).toHaveProperty('message');
        if (expectedMessage) {
            expect(response.message).toContain(expectedMessage);
        }
    }
}
