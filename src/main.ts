// Import necessary modules and classes from NestJS and Fastify libraries
import compression from '@fastify/compress';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';

// Import the main application module
import { AppModule } from './app.module';

// Import custom filters and interceptors for error handling and response body formatting
import { ErrorFilter } from './filters/ExceptionFilter';
import { ResponseBodyInterceptor } from './interceptors/ResponseBodyInterceptor';

// Import built-in classes for validation, serialization, and Swagger documentation
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ValidationFailed } from './types/error.types';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * The main entry point of the application.
 */
async function bootstrap() {
    // Create a new NestJS application instance using Fastify as the underlying server
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
    app.register(multipart, {
        limits: {
          fileSize: 25 * 1024 * 1024, //25 MB
        },
      });
    /**
     * Add a polyfill to make Passport.js compatible with Fastify.
     * This is necessary because Fastify has a different API than Express.js.
     */
    app.getHttpAdapter()
        .getInstance()
        .addHook('onRequest', (request: any, reply: any, done) => {
            // Set up the reply object to mimic the Express.js API
            reply.setHeader = function (key: any, value: any) {
                return this.raw.setHeader(key, value);
            };
            reply.end = function () {
                this.raw.end();
            };
            request.res = reply;
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
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api_doc', app, document);

    // Register the compression middleware to enable gzip and deflate encoding
    await app.register(compression, {
        encodings: ['gzip', 'deflate']
    });

    // Start listening on the specified port and host
    await app.listen(process.env.PORT!, '0.0.0.0');
}

// Call the bootstrap function to start the application
bootstrap();
