import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FastifyMulterModule } from '@nest-lab/fastify-multer';
import { AuthModule } from './base_modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { validate } from './utils/validate-env';
import { EnterpriseModule } from './enterprise_modules/enterprise.module';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { CodeClarityModule } from './codeclarity_modules/codeclarity.module';

// Entities
import { Notification } from './entity/codeclarity/Notification';
import { File } from './entity/codeclarity/File';
import { Invitation } from './entity/codeclarity/Invitation';
import { Email } from './entity/codeclarity/Email';
import { RepositoryCache } from './entity/codeclarity/RepositoryCache';
import { OrganizationMemberships } from './entity/codeclarity/OrganizationMemberships';
import { Result } from './entity/codeclarity/Result';
import { Project } from './entity/codeclarity/Project';
import { Log } from './entity/codeclarity/Log';
import { Integration } from './entity/codeclarity/Integration';
import { Analyzer } from './entity/codeclarity/Analyzer';
import { Policy } from './entity/codeclarity/Policy';
import { Organization } from './entity/codeclarity/Organization';
import { Analysis } from './entity/codeclarity/Analysis';
import { User } from './entity/codeclarity/User';
import { License } from './entity/knowledge/License';
import { NVD } from './entity/knowledge/NVD';
import { OSV } from './entity/knowledge/OSV';
import { CWE } from './entity/knowledge/CWE';
import { Package, Version } from './entity/knowledge/Package';
import { Plugin } from './entity/plugin/Plugin';

const ENV = process.env.ENV;
const password = process.env.PG_DB_PASSWORD;
const host = process.env.PG_DB_HOST;
const user = process.env.PG_DB_USER;
const port = parseInt(process.env.PG_DB_PORT || '6432', 10);

const defaultOptions: PostgresConnectionOptions = {
    type: 'postgres',
    host: host,
    port: port,
    username: user,
    password: password,
    synchronize: true,
    logging: false
    // dropSchema: true
};
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'codeclarity',
            useFactory: () => ({
                ...defaultOptions,
                autoLoadEntities: true,
                database: 'codeclarity',
                entities: [
                    User,
                    Analysis,
                    Organization,
                    Policy,
                    Analyzer,
                    Integration,
                    Log,
                    Notification,
                    Project,
                    Result,
                    OrganizationMemberships,
                    RepositoryCache,
                    Email,
                    Invitation,
                    File,
                    __dirname + '/enterprise_modules/**/*.entity.{js,ts}'
                ]
            })
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'plugin',
            useFactory: () => ({
                ...defaultOptions,
                database: 'plugins',
                entities: [Plugin]
            })
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'knowledge',
            useFactory: () => ({
                ...defaultOptions,
                database: 'knowledge',
                entities: [CWE, NVD, OSV, Package, Version, License]
            })
        }),
        ConfigModule.forRoot({
            validate,
            isGlobal: true,
            envFilePath: !ENV ? 'env/.env.dev' : `env/.env.${ENV}`,
            expandVariables: true
        }),
        AuthModule,
        FastifyMulterModule,
        EnterpriseModule,
        CodeClarityModule
    ],
    controllers: [],
    providers: []
})
export class AppModule {}
