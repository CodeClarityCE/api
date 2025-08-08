import { defaultOptions, AppModule } from './app.module';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AppModule', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Module Definition', () => {
        it('should be defined', () => {
            expect(AppModule).toBeDefined();
        });

        it('should be a class with Module decorator', () => {
            expect(typeof AppModule).toBe('function');
            expect(AppModule.name).toBe('AppModule');
        });
    });

    describe('Database Configuration', () => {
        it('should read environment variables for database connection', () => {
            const moduleContent = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

            expect(moduleContent).toContain('process.env.PG_DB_PASSWORD');
            expect(moduleContent).toContain('process.env.PG_DB_HOST');
            expect(moduleContent).toContain('process.env.PG_DB_USER');
            expect(moduleContent).toContain('process.env.PG_DB_PORT');
        });

        it('should use default port fallback', () => {
            const moduleContent = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

            expect(moduleContent).toContain("parseInt(process.env.PG_DB_PORT || '6432', 10)");
        });

        it('should disable logging by default', () => {
            const moduleContent = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

            expect(moduleContent).toContain('logging: false');
        });
    });

    describe('Module Configuration Structure', () => {
        it('should have correct database connection properties', () => {
            expect(defaultOptions).toHaveProperty('type', 'postgres');
            expect(defaultOptions).toHaveProperty('logging', false);
            expect(defaultOptions).toHaveProperty('synchronize');
            expect(defaultOptions).toHaveProperty('host');
            expect(defaultOptions).toHaveProperty('port');
            expect(defaultOptions).toHaveProperty('username');
            expect(defaultOptions).toHaveProperty('password');
        });

        it('should be a PostgreSQL connection configuration', () => {
            expect(defaultOptions.type).toBe('postgres');
        });

        it('should have logging disabled by default', () => {
            expect(defaultOptions.logging).toBe(false);
        });
    });

    describe('Environment Configuration Logic', () => {
        it('should allow force sync via DB_FORCE_SYNC variable', () => {
            const moduleContent = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');
            expect(moduleContent).toContain('DB_FORCE_SYNC');
        });

        it('should have configurable environment file paths', () => {
            const moduleContent = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

            expect(moduleContent).toContain('envFilePath:');
            expect(moduleContent).toContain('env/.env.dev');
            expect(moduleContent).toContain('env/.env.${ENV}');
        });
    });
});
