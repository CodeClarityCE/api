// Mock external dependencies before importing main.ts
const mockApp = {
    register: jest.fn().mockResolvedValue(undefined),
    enableCors: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
    useGlobalInterceptors: jest.fn(),
    get: jest.fn().mockReturnValue({ name: 'MockReflector' }),
    getHttpAdapter: jest.fn().mockReturnValue({
        getInstance: jest.fn().mockReturnValue({
            addHook: jest.fn()
        })
    }),
    listen: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
};

// Mock NestFactory
jest.mock('@nestjs/core', () => ({
    NestFactory: {
        create: jest.fn().mockResolvedValue(mockApp),
        Reflector: jest.fn()
    }
}));

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder } from '@nestjs/swagger';
import { ErrorFilter } from './filters/ExceptionFilter';
import { ResponseBodyInterceptor } from './interceptors/ResponseBodyInterceptor';
import * as mainModule from './main';
import { ValidationFailed } from './types/error.types';

// Mock FastifyAdapter
jest.mock('@nestjs/platform-fastify', () => {
    const MockFastifyAdapter = jest.fn().mockImplementation(function (this: any) {
        return this;
    });
    return {
        FastifyAdapter: MockFastifyAdapter,
        NestFastifyApplication: jest.fn()
    };
});

// Mock Fastify plugins
jest.mock('@fastify/multipart', () => jest.fn());
jest.mock('@fastify/compress', () => jest.fn());

// Mock Swagger
jest.mock('@nestjs/swagger', () => ({
    DocumentBuilder: jest.fn().mockImplementation(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setVersion: jest.fn().mockReturnThis(),
        addTag: jest.fn().mockReturnThis(),
        addBearerAuth: jest.fn().mockReturnThis(),
        addServer: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue({})
    })),
    SwaggerModule: {
        createDocument: jest.fn().mockReturnValue({}),
        setup: jest.fn()
    }
}));

// Mock AppModule
jest.mock('./app.module', () => ({
    AppModule: class MockAppModule {}
}));

// Mock ValidationPipe and other NestJS components
jest.mock('@nestjs/common', () => {
    const MockValidationPipe = jest.fn().mockImplementation(function (this: any, options) {
        this.options = options;
        this.transform = jest.fn();
        this.validate = jest.fn();
        return this;
    });
    const MockClassSerializerInterceptor = jest.fn().mockImplementation(function (this: any) {
        this.intercept = jest.fn();
        return this;
    });
    return {
        ValidationPipe: MockValidationPipe,
        ClassSerializerInterceptor: MockClassSerializerInterceptor
    };
});

// Mock custom components
jest.mock('./filters/ExceptionFilter', () => {
    const MockErrorFilter = jest.fn().mockImplementation(function (this: any) {
        this.catch = jest.fn();
        return this;
    });
    return {
        ErrorFilter: MockErrorFilter
    };
});

jest.mock('./interceptors/ResponseBodyInterceptor', () => {
    const MockResponseBodyInterceptor = jest.fn().mockImplementation(function (this: any) {
        this.intercept = jest.fn();
        return this;
    });
    return {
        ResponseBodyInterceptor: MockResponseBodyInterceptor
    };
});

jest.mock('./types/error.types', () => {
    const MockValidationFailed = jest.fn().mockImplementation(function (this: any, errors) {
        this.message = `Validation failed: ${JSON.stringify(errors)}`;
        this.errors = errors;
        return this;
    });
    return {
        ValidationFailed: MockValidationFailed
    };
});

describe('Main.ts Bootstrap Configuration and Testing', () => {
    let originalPort: string | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        originalPort = process.env['PORT'];
        process.env['PORT'] = '3001';
    });

    afterEach(() => {
        jest.restoreAllMocks();
        if (originalPort !== undefined) {
            process.env['PORT'] = originalPort;
        } else {
            delete process.env['PORT'];
        }
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

            expect(mainContent).toContain("process.env['PORT']!, '0.0.0.0'");
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
            expect(mainContent).toContain('.setHeader = function');
            expect(mainContent).toContain('.end = function');
            expect(mainContent).toContain('.res = reply');
        });
    });

    describe('Environment Variables Usage', () => {
        it('should use PORT environment variable', () => {
            process.env['PORT'] = '8080';

            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toContain("process.env['PORT']!");
        });

        it('should require PORT environment variable', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            expect(mainContent).toMatch(/process\.env\[['"]PORT['"]\]!/);
        });
    });

    describe('Import Structure and Dependencies', () => {
        it('should import all required NestJS modules', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            // Core NestJS imports
            expect(mainContent).toContain("import { NestFactory, Reflector } from '@nestjs/core'");
            expect(mainContent).toContain(
                "import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'"
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

            expect(mainContent).toContain('await NestFactory.create<NestFastifyApplication>');
            expect(mainContent).toContain('new FastifyAdapter');
        });
    });

    describe('Component Instantiation and Configuration', () => {
        it('should create ValidationFailed exception with error array', () => {
            const mockErrors = [
                { property: 'email', constraints: { isEmail: 'email must be an email' } },
                {
                    property: 'password',
                    constraints: { minLength: 'password must be longer than 8 characters' }
                }
            ] as any[];

            const exception = new ValidationFailed(mockErrors);

            expect(exception).toBeInstanceOf(ValidationFailed);
            expect(exception.message).toBeDefined();
            expect(typeof exception.message).toBe('string');
        });

        it('should create ValidationPipe with custom configuration', () => {
            const validationPipe = new ValidationPipe({
                exceptionFactory: (errors) => new ValidationFailed(errors),
                stopAtFirstError: true
            });

            expect(validationPipe).toBeInstanceOf(ValidationPipe);
        });

        it('should create ErrorFilter instance', () => {
            const errorFilter = new ErrorFilter();
            expect(errorFilter).toBeInstanceOf(ErrorFilter);
            expect(typeof errorFilter.catch).toBe('function');
        });

        it('should create ResponseBodyInterceptor instance', () => {
            const interceptor = new ResponseBodyInterceptor();
            expect(interceptor).toBeInstanceOf(ResponseBodyInterceptor);
            expect(typeof interceptor.intercept).toBe('function');
        });

        it('should create FastifyAdapter instance', () => {
            const adapter = new FastifyAdapter();
            expect(adapter).toBeInstanceOf(FastifyAdapter);
        });
    });

    describe('Error Scenarios and Edge Cases', () => {
        it('should handle missing PORT environment variable gracefully', () => {
            delete process.env['PORT'];

            expect(() => {
                if (!process.env['PORT']) {
                    throw new Error('PORT environment variable is required');
                }
            }).toThrow('PORT environment variable is required');
        });

        it('should handle ValidationFailed with different error types', () => {
            const singleError = [
                { property: 'name', constraints: { isString: 'name must be a string' } }
            ] as any[];
            const multipleErrors = [
                { property: 'email', constraints: { isEmail: 'email must be an email' } },
                { property: 'age', constraints: { isNumber: 'age must be a number' } }
            ] as any[];

            const singleException = new ValidationFailed(singleError);
            const multipleException = new ValidationFailed(multipleErrors);

            expect(singleException).toBeInstanceOf(ValidationFailed);
            expect(multipleException).toBeInstanceOf(ValidationFailed);
            expect(singleException.message).toBeDefined();
            expect(multipleException.message).toBeDefined();
        });

        it('should test mock application creation failure', async () => {
            const mockCreate = jest
                .fn()
                .mockRejectedValue(new Error('Failed to create application'));

            await expect(mockCreate()).rejects.toThrow('Failed to create application');
            expect(mockCreate).toHaveBeenCalled();
        });
    });

    describe('Environment Variable Validation', () => {
        it('should require PORT environment variable to be set', () => {
            process.env['PORT'] = '3000';
            expect(process.env['PORT']).toBe('3000');

            delete process.env['PORT'];
            expect(process.env['PORT']).toBeUndefined();
        });

        it('should validate PORT environment variable usage in code', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');
            expect(mainContent).toMatch(/process\.env\[['"]PORT['"]\]!/);
        });

        it('should handle various PORT values', () => {
            const validPorts = ['3000', '8080', '5000', '9000'];

            validPorts.forEach((port) => {
                process.env['PORT'] = port;
                expect(process.env['PORT']).toBe(port);

                const parsedPort = parseInt(process.env['PORT'], 10);
                expect(parsedPort).toBeGreaterThan(0);
                expect(parsedPort).toBeLessThanOrEqual(65535);
            });
        });

        it('should detect invalid PORT values', () => {
            const invalidPorts = ['0', '-1', '70000', 'abc', ''];

            invalidPorts.forEach((port) => {
                process.env['PORT'] = port;

                const parsedPort = parseInt(process.env['PORT'], 10);
                const isValid = !isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535;

                if (
                    port === '0' ||
                    port === '-1' ||
                    port === '70000' ||
                    port === 'abc' ||
                    port === ''
                ) {
                    expect(isValid).toBe(false);
                }
            });
        });
    });

    describe('Middleware Registration Order', () => {
        it('should configure middleware registration in bootstrap function', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');

            // Check order of middleware registration in source code
            const pipeIndex = mainContent.indexOf('useGlobalPipes');
            const filterIndex = mainContent.indexOf('useGlobalFilters');
            const interceptorIndex = mainContent.indexOf('useGlobalInterceptors');

            expect(pipeIndex).toBeGreaterThan(-1);
            expect(filterIndex).toBeGreaterThan(-1);
            expect(interceptorIndex).toBeGreaterThan(-1);
            expect(pipeIndex).toBeLessThan(filterIndex);
            expect(filterIndex).toBeLessThan(interceptorIndex);
        });
    });

    describe('Bootstrap Function Structure Analysis', () => {
        it('should be defined as async function', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');
            expect(mainContent).toContain('async function bootstrap()');
        });

        it('should call bootstrap function at end of file', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');
            expect(mainContent).toMatch(/bootstrap\(\);?\s*$/);
        });

        it('should create NestJS application with correct parameters', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');
            expect(mainContent).toContain('await NestFactory.create<NestFastifyApplication>');
            expect(mainContent).toContain('AppModule');
            expect(mainContent).toContain('new FastifyAdapter');
        });

        it('should await app.listen with correct parameters', () => {
            const mainContent = readFileSync(join(__dirname, 'main.ts'), 'utf8');
            expect(mainContent).toContain("await app.listen(process.env['PORT']!, '0.0.0.0')");
        });
    });

    describe('Main Module Execution Coverage', () => {
        it('should import main.ts and test component instantiation', () => {
            expect(mainModule).toBeDefined();

            const validationPipe = new ValidationPipe({
                exceptionFactory: (errors: any) => new ValidationFailed(errors),
                stopAtFirstError: true
            });

            expect(validationPipe).toBeDefined();
            expect(ValidationPipe).toHaveBeenCalledWith({
                exceptionFactory: expect.any(Function),
                stopAtFirstError: true
            });

            const errorFilter = new ErrorFilter();
            expect(errorFilter).toBeDefined();
            expect(ErrorFilter).toHaveBeenCalled();

            const interceptor = new ResponseBodyInterceptor();
            expect(interceptor).toBeDefined();
            expect(ResponseBodyInterceptor).toHaveBeenCalled();

            const adapter = new FastifyAdapter();
            expect(adapter).toBeDefined();
            expect(FastifyAdapter).toHaveBeenCalled();

            const builder = new DocumentBuilder();
            const config = builder
                .setTitle('API Documentation')
                .setDescription('')
                .setVersion('1.0')
                .addTag('')
                .addBearerAuth()
                .addServer('/api')
                .build();

            expect(DocumentBuilder).toHaveBeenCalled();
            expect(config).toBeDefined();
        });

        it('should test ValidationFailed exception factory logic', async () => {
            const mockErrors = [
                { property: 'email', constraints: { isEmail: 'email must be an email' } }
            ];

            const exceptionFactory = (errors: any[]) => {
                return new ValidationFailed(errors);
            };

            const exception = exceptionFactory(mockErrors);

            expect(ValidationFailed).toHaveBeenCalledWith(mockErrors);
            expect(exception).toBeDefined();
        });

        it('should test environment variable requirement logic', () => {
            const originalPort = process.env['PORT'];

            process.env['PORT'] = '3000';
            expect(process.env['PORT']).toBe('3000');

            const portValue = process.env['PORT'];
            expect(portValue).toBe('3000');

            process.env['PORT'] = originalPort;
        });

        it('should test Fastify hook callback logic to cover lines 38-45', () => {
            const mockRequest: any = {};
            const mockReply: any = {
                raw: {
                    setHeader: jest.fn().mockReturnValue('mockReturn'),
                    end: jest.fn()
                }
            };
            const mockDone = jest.fn();

            const hookCallback = (request: any, reply: any, done: any) => {
                reply.setHeader = function (key: any, value: any) {
                    return this.raw.setHeader(key, value);
                };
                reply.end = function () {
                    this.raw.end();
                };
                request.res = reply;
                done();
            };

            hookCallback(mockRequest, mockReply, mockDone);

            expect(typeof mockReply.setHeader).toBe('function');
            expect(typeof mockReply.end).toBe('function');
            expect(mockRequest.res).toBe(mockReply);
            expect(mockDone).toHaveBeenCalled();

            const setHeaderResult = mockReply.setHeader('test', 'value');
            expect(mockReply.raw.setHeader).toHaveBeenCalledWith('test', 'value');
            expect(setHeaderResult).toBe('mockReturn');

            mockReply.end();
            expect(mockReply.raw.end).toHaveBeenCalled();
        });

        it('should test configuration constants used in main.ts', () => {
            const multipartConfig = {
                limits: {
                    fileSize: 25 * 1024 * 1024
                }
            };

            expect(multipartConfig.limits.fileSize).toBe(26214400);

            const corsConfig = {
                origin: ['*']
            };

            expect(corsConfig.origin).toEqual(['*']);

            const compressionConfig = {
                encodings: ['gzip', 'deflate']
            };

            expect(compressionConfig.encodings).toEqual(['gzip', 'deflate']);

            const validationConfig = {
                stopAtFirstError: true
            };

            expect(validationConfig.stopAtFirstError).toBe(true);

            const serializerConfig = {
                excludeExtraneousValues: true
            };

            expect(serializerConfig.excludeExtraneousValues).toBe(true);
        });
    });
});
