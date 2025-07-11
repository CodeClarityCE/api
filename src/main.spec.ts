import { ValidationFailed } from './types/error.types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Main Bootstrap Configuration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Module Imports and Structure', () => {
        it('should have main.ts file', () => {
            const mainExists = existsSync(join(__dirname, 'main.ts'));
            expect(mainExists).toBe(true);
        });

        it('should have bootstrap function available', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('async function bootstrap()');
            expect(mainContent).toContain('bootstrap()');
        });
    });

    describe('Application Configuration Constants', () => {
        it('should have correct multipart file size limit', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('fileSize: 25 * 1024 * 1024');
        });

        it('should configure CORS for all origins', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("origin: ['*']");
        });

        it('should set up Swagger documentation', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('API Documentation');
            expect(mainContent).toContain('addBearerAuth()');
            expect(mainContent).toContain("addServer('/api')");
            expect(mainContent).toContain("SwaggerModule.setup('api_doc'");
        });

        it('should configure compression middleware', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("encodings: ['gzip', 'deflate']");
        });
    });

    describe('Validation Configuration', () => {
        it('should have ValidationFailed exception class', () => {
            expect(ValidationFailed).toBeDefined();
            expect(typeof ValidationFailed).toBe('function');
        });

        it('should configure validation pipe correctly', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('stopAtFirstError: true');
            expect(mainContent).toContain('ValidationFailed(errors)');
        });
    });

    describe('Server Configuration', () => {
        it('should listen on environment PORT', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("process.env.PORT!, '0.0.0.0'");
        });

        it('should use Fastify as HTTP adapter', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('FastifyAdapter');
            expect(mainContent).toContain('NestFastifyApplication');
        });
    });

    describe('Middleware and Interceptor Configuration', () => {
        it('should configure global pipes, filters, and interceptors', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('useGlobalPipes');
            expect(mainContent).toContain('useGlobalFilters');
            expect(mainContent).toContain('useGlobalInterceptors');
            expect(mainContent).toContain('ErrorFilter');
            expect(mainContent).toContain('ResponseBodyInterceptor');
            expect(mainContent).toContain('ClassSerializerInterceptor');
        });

        it('should configure serializer with excludeExtraneousValues', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('excludeExtraneousValues: true');
        });
    });

    describe('Fastify Compatibility Configuration', () => {
        it('should configure Passport.js compatibility hook', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("addHook('onRequest'");
            expect(mainContent).toContain('reply.setHeader = function');
            expect(mainContent).toContain('reply.end = function');
            expect(mainContent).toContain('request.res = reply');
        });
    });

    describe('Environment Variables Usage', () => {
        let originalPort: string | undefined;

        beforeEach(() => {
            originalPort = process.env.PORT;
        });

        afterEach(() => {
            if (originalPort !== undefined) {
                process.env.PORT = originalPort;
            } else {
                delete process.env.PORT;
            }
        });

        it('should use PORT environment variable', () => {
            process.env.PORT = '8080';

            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('process.env.PORT!');
        });

        it('should require PORT environment variable', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toMatch(/process\.env\.PORT!/);
        });
    });

    describe('Import Structure', () => {
        it('should import all required NestJS modules', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("import { NestFactory, Reflector } from '@nestjs/core'");
            expect(mainContent).toContain(
                "import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'"
            );
            expect(mainContent).toContain(
                "import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'"
            );
            expect(mainContent).toContain(
                "import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'"
            );
        });

        it('should import custom components', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("import { AppModule } from './app.module'");
            expect(mainContent).toContain(
                "import { ErrorFilter } from './filters/ExceptionFilter'"
            );
            expect(mainContent).toContain(
                "import { ResponseBodyInterceptor } from './interceptors/ResponseBodyInterceptor'"
            );
            expect(mainContent).toContain("import { ValidationFailed } from './types/error.types'");
        });

        it('should import Fastify plugins', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("import compression from '@fastify/compress'");
            expect(mainContent).toContain("import multipart from '@fastify/multipart'");
        });
    });

    describe('Bootstrap Function Structure', () => {
        it('should be an async function', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain('async function bootstrap()');
        });

        it('should call the bootstrap function', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toMatch(/bootstrap\(\);?\s*$/);
        });

        it('should create NestJS application instance', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain(
                'await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())'
            );
        });
    });
});
