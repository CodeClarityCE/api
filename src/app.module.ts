import { Module } from '@nestjs/common';
import { FastifyMulterModule } from '@nest-lab/fastify-multer';
import { AuthModule } from './base_modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { validate } from './utils/validate-env';
import { EnterpriseModule } from './enterprise_modules/enterprise.module';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { CodeClarityModule } from './codeclarity_modules/codeclarity.module';
import { BaseModule } from './base_modules/base.module';

const ENV = process.env.ENV;
const password = process.env.PG_DB_PASSWORD;
const host = process.env.PG_DB_HOST;
const user = process.env.PG_DB_USER;
const port = parseInt(process.env.PG_DB_PORT || '6432', 10);

export const defaultOptions: PostgresConnectionOptions = {
    type: 'postgres',
    host: host,
    port: port,
    username: user,
    password: password,
    synchronize: true,
    logging: false,
    // dropSchema: true
};

/**
 * The main application module, responsible for importing and configuring all other modules.
 */
@Module({
    /**
     * List of imported modules.
     */
    imports: [
        // Module for handling authentication-related functionality.
        AuthModule,
        // Module for handling file uploads using Fastify Multer.
        FastifyMulterModule,
        // Module for managing application configuration, including environment variables and validation.
        ConfigModule.forRoot({
            validate,
            isGlobal: true,
            envFilePath: !ENV ? 'env/.env.dev' : `env/.env.${ENV}`,
            expandVariables: true
        }),
        // Base module that provides core functionality such as user management, project management, etc.
        BaseModule,
        // Module for handling CodeClarity-related functionality, including SBOM and vulnerability reporting.
        CodeClarityModule,
        // Enterprise module that extends the platform's functionality with additional features.
        EnterpriseModule,
    ]
})
export class AppModule { }
