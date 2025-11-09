// Import necessary modules and classes from NestJS and Fastify libraries
import compression from '@fastify/compress';
import multipart from '@fastify/multipart';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ErrorFilter } from './filters/ExceptionFilter';
import { ResponseBodyInterceptor } from './interceptors/ResponseBodyInterceptor';
import { ValidationFailed } from './types/error.types';

/**
 * The main entry point of the application.
 */
async function bootstrap(): Promise<void> {
    // Create a new NestJS application instance using Fastify as the underlying server
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
    await app.register(multipart as Parameters<typeof app.register>[0], {
        limits: {
            fileSize: 25 * 1024 * 1024 //25 MB
        }
    });
    /**
     * Add a polyfill to make Passport.js compatible with Fastify.
     * This is necessary because Fastify has a different API than Express.js.
     */
    interface RawResponse {
        setHeader: (key: string, value: string) => void;
        end: () => void;
    }

    app.getHttpAdapter()
        .getInstance()
        .addHook('onRequest', (request, reply, done) => {
            // Set up the reply object to mimic the Express.js API
            interface ReplyWithPolyfill {
                raw: RawResponse;
                setHeader?: (key: string, value: string) => void;
                end?: () => void;
            }
            interface RequestWithRes {
                res?: unknown;
            }

            (reply as unknown as ReplyWithPolyfill).setHeader = function (this: { raw: RawResponse }, key: string, value: string) {
                return this.raw.setHeader(key, value);
            };
            (reply as unknown as ReplyWithPolyfill).end = function (this: { raw: RawResponse }) {
                this.raw.end();
            };
            (request as unknown as RequestWithRes).res = reply;
            done();
        });

    // Enable CORS for all origins
    app.enableCors({
        origin: ['*']
    });

    /**
     * Set up global pipes for validation and error handling.
     * The ValidationPipe will throw a ValidationFailed exception if any validation errors occur.
     */
    app.useGlobalPipes(
        new ValidationPipe({
            // Create a custom ValidationFailed exception when validation fails
            exceptionFactory: (errors) => {
                return new ValidationFailed(errors);
            },
            // Stop at the first error and don't continue validating other fields
            stopAtFirstError: true
        })
    );

    // Set up global filters for error handling
    app.useGlobalFilters(new ErrorFilter());

    // Set up global interceptors for response body formatting and serialization
    app.useGlobalInterceptors(new ResponseBodyInterceptor());
    app.useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector), {
            // Exclude extraneous values from the serialized output
            excludeExtraneousValues: true
        })
    );

    /**
     * Set up Swagger documentation for the API.
     */
    const config = new DocumentBuilder()
        .setTitle('API Documentation')
        .setDescription('')
        .setVersion('1.0')
        .addTag('')
        .addBearerAuth()
        .addServer('/api')
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api_doc', app, document);

    // Register the compression middleware to enable gzip and deflate encoding
    await app.register(compression as Parameters<typeof app.register>[0], {
        encodings: ['gzip', 'deflate']
    });

    // Start listening on the specified port and host
    await app.listen(process.env['PORT']!, '0.0.0.0');
}

// Call the bootstrap function to start the application
void bootstrap();
