import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm';
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
@Module({
    imports: [
        AuthModule,
        FastifyMulterModule,
        BaseModule,
        CodeClarityModule,
        EnterpriseModule,
        // TypeOrmModule.forRootAsync({
        //     imports: [ConfigModule],
        //     name: 'codeclarity',
        //     useFactory: () => ({
        //         ...defaultOptions,
        //         autoLoadEntities: true,
        //         database: 'codeclarity',
        //         entities: [
        //             __dirname + '/enterprise_modules/**/*.entity.{js,ts}'
        //         ]
        //     })
        // }),
        ConfigModule.forRoot({
            validate,
            isGlobal: true,
            envFilePath: !ENV ? 'env/.env.dev' : `env/.env.${ENV}`,
            expandVariables: true
        }),
    ],
    controllers: [],
    providers: []
})
export class AppModule { }
