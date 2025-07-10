import { Injectable } from '@nestjs/common';

/**
 * Mock implementations for commonly used services
 */

@Injectable()
export class MockEmailService {
    async sendEmail(to: string, subject: string, _body: string): Promise<void> {
        // Mock implementation - just log or store for testing
        console.log(`Mock email sent to ${to}: ${subject}`);
    }

    async sendWelcomeEmail(email: string, name: string): Promise<void> {
        console.log(`Mock welcome email sent to ${email} for ${name}`);
    }

    async sendPasswordResetEmail(email: string, token: string): Promise<void> {
        console.log(`Mock password reset email sent to ${email} with token ${token}`);
    }
}

@Injectable()
export class MockRabbitMQService {
    async publish(queue: string, message: any): Promise<void> {
        console.log(`Mock message published to ${queue}:`, message);
    }

    async consume(queue: string, _callback: (message: any) => void): Promise<void> {
        console.log(`Mock consumer registered for queue ${queue}`);
    }
}

@Injectable()
export class MockGitHubService {
    async getRepository(owner: string, repo: string): Promise<any> {
        return {
            id: 123,
            name: repo,
            full_name: `${owner}/${repo}`,
            description: 'Mock repository',
            private: false,
            clone_url: `https://github.com/${owner}/${repo}.git`
        };
    }

    async getRepositoryContents(_owner: string, _repo: string, _path: string): Promise<any[]> {
        return [
            {
                name: 'package.json',
                path: 'package.json',
                type: 'file',
                content: 'eyJuYW1lIjoidGVzdCJ9' // base64 encoded {"name":"test"}
            }
        ];
    }
}

@Injectable()
export class MockAnalysisService {
    async startAnalysis(projectId: number, analysisType: string): Promise<any> {
        return {
            id: 1,
            uuid: 'mock-analysis-uuid',
            projectId,
            status: 'queued',
            type: analysisType,
            createdAt: new Date()
        };
    }

    async getAnalysisStatus(analysisId: string): Promise<any> {
        return {
            id: 1,
            uuid: analysisId,
            status: 'completed',
            progress: 100,
            updatedAt: new Date()
        };
    }
}

/**
 * Mock repository implementations
 */
export class MockRepository {
    private entities: any[] = [];

    async find(_options?: any): Promise<any[]> {
        return this.entities;
    }

    async findOne(options: any): Promise<any> {
        return this.entities.find((entity) => {
            if (options.where?.id) {
                return entity.id === options.where.id;
            }
            if (options.where?.email) {
                return entity.email === options.where.email;
            }
            return false;
        });
    }

    async save(entity: any): Promise<any> {
        const existingIndex = this.entities.findIndex((e) => e.id === entity.id);
        if (existingIndex >= 0) {
            this.entities[existingIndex] = { ...this.entities[existingIndex], ...entity };
            return this.entities[existingIndex];
        } else {
            const newEntity = { ...entity, id: this.entities.length + 1 };
            this.entities.push(newEntity);
            return newEntity;
        }
    }

    async remove(entity: any): Promise<void> {
        const index = this.entities.findIndex((e) => e.id === entity.id);
        if (index >= 0) {
            this.entities.splice(index, 1);
        }
    }

    async delete(criteria: any): Promise<void> {
        this.entities = this.entities.filter((entity) => {
            if (criteria.id) {
                return entity.id !== criteria.id;
            }
            return true;
        });
    }

    async clear(): Promise<void> {
        this.entities = [];
    }

    async count(_options?: any): Promise<number> {
        return this.entities.length;
    }

    // Add entities for testing
    addEntity(entity: any): void {
        this.entities.push(entity);
    }

    getEntities(): any[] {
        return this.entities;
    }
}

/**
 * Factory for creating mock providers
 */
export class MockProviderFactory {
    /**
     * Create a mock repository provider
     */
    static createMockRepository(token: string): any {
        return {
            provide: token,
            useClass: MockRepository
        };
    }

    /**
     * Create a mock service provider
     */
    static createMockService(token: string, mockImplementation: any): any {
        return {
            provide: token,
            useValue: mockImplementation
        };
    }

    /**
     * Create a mock ConfigService
     */
    static createMockConfigService(config: Record<string, any> = {}): any {
        return {
            provide: 'ConfigService',
            useValue: {
                get: jest.fn((key: string) => config[key])
            }
        };
    }

    /**
     * Create a mock JwtService
     */
    static createMockJwtService(): any {
        return {
            provide: 'JwtService',
            useValue: {
                sign: jest.fn((_payload) => 'mock-jwt-token'),
                verify: jest.fn((_token) => ({ userId: 1, email: 'test@example.com' }))
            }
        };
    }
}
