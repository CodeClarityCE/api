import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';

import { AuthModule } from './base_modules/auth/auth.module';
import { BaseModule } from './base_modules/base.module';
import { CodeClarityModule } from './codeclarity_modules/codeclarity.module';
import { EnterpriseModule } from './enterprise_modules/enterprise.module';
import { MetricsModule } from './metrics/metrics.module';
import { validate } from './utils/validate-env';

const ENV = process.env['ENV'];
const password = process.env['PG_DB_PASSWORD'];
const host = process.env['PG_DB_HOST'];
const user = process.env['PG_DB_USER'];
const port = parseInt(process.env['PG_DB_PORT'] || '6432', 10);

export const defaultOptions: PostgresConnectionOptions = {
    type: 'postgres',
    host: host || 'localhost',
    port: port,
    username: user || 'postgres',
    password: password || '',
    // synchronize is now disabled by default; can be force-enabled in local/dev ONLY.
    // Use proper TypeORM migrations instead (see src/migrations/* and datasource files).
    synchronize: process.env['DB_FORCE_SYNC'] === 'true',
    logging: false
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
        // Module for exposing Prometheus metrics
        MetricsModule
    ]
})
export class AppModule {}
