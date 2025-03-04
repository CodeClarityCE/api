import 'reflect-metadata';
import { Transform, plainToInstance } from 'class-transformer';
import {
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    ValidationError,
    validateSync
} from 'class-validator';
const dotenv = require('dotenv');

export enum Environment {
    Development = 'dev',
    Production = 'prod',
    Staging = 'staging',
    Test = 'test'
}

class EnvironmentVariables {
    @IsEnum(Environment)
    ENV: Environment;

    @IsNumber()
    PORT: number;

    @IsNotEmpty()
    HOST: string;

    // Github oauth
    @IsNotEmpty()
    GITHUB_AUTH_CLIENT_ID: string;

    @IsNotEmpty()
    GITHUB_AUTH_CLIENT_SECRET: string;

    // Gitlab oauth
    @IsNotEmpty()
    GITLAB_AUTH_CLIENT_ID: string;

    @IsNotEmpty()
    GITLAB_AUTH_CLIENT_SECRET: string;

    @IsNotEmpty()
    GITLAB_AUTH_HOST: string;

    // Authentication
    @IsNotEmpty()
    GITHUB_AUTH_CALLBACK: string;

    @IsNotEmpty()
    GITLAB_AUTH_CALLBACK: string;

    // AMQP
    @IsNotEmpty()
    AMQP_ANALYSES_QUEUE: string;

    @IsNotEmpty()
    AMQP_PROTOCOL: string;

    @IsNotEmpty()
    AMQP_HOST: string;

    @IsNotEmpty()
    AMQP_PORT: string;

    @IsNotEmpty()
    AMQP_USER: string;

    @IsNotEmpty()
    AMQP_PASSWORD: string;

    // Email
    @IsNotEmpty()
    MAIL_HOST: string;

    @IsNumber()
    MAIL_PORT: number;

    @IsNotEmpty()
    MAIL_AUTH_USER: string;

    @IsNotEmpty()
    MAIL_AUTH_PASSWORD: string;

    @IsNotEmpty()
    MAIL_DEFAULT_FROM: string;

    // Database
    @IsNotEmpty()
    COOKIE_SECRET: string;

    @IsNotEmpty()
    GITHUB_CALLBACK: string;

    @IsNotEmpty()
    GITLAB_CALLBACK: string;

    @IsNotEmpty()
    WEB_HOST: string;

    @IsNotEmpty()
    PLATFORM_NAME: string;
}

class DevEnvironmentVariables extends EnvironmentVariables {
    @IsNotEmpty()
    @IsEmail()
    TEST_EMAIL: string;

    @IsNotEmpty()
    @Transform(
        (v) => {
            return v.obj['REQUIRE_ACCOUNT_VERIFICATION'] == 'true' ? true : false;
        },
        { toClassOnly: true }
    )
    REQUIRE_ACCOUNT_VERIFICATION: boolean;
}

function validateBootstrap() {
    const env = process.env.ENV;

    let errors: ValidationError[] = [];
    let validatedConfig: EnvironmentVariables;

    if (env == undefined || env == '') {
        throw Error("'ENV' environment variable missing");
    }

    // Load config from .env files
    let res;
    if (env == 'dev') {
        res = dotenv.config({ path: 'env/.env.dev', override: false });
    } else if (env == 'prod') {
        res = dotenv.config({ path: 'env/.env.prod', override: false });
    } else if (env == 'staging') {
        res = dotenv.config({ path: 'env/.env.staging', override: false });
    } else if (env == 'test') {
        res = dotenv.config({ path: 'env/.env.test', override: false });
    }

    if (res.error) {
        throw res.error;
    }

    if (env == Environment.Development) {
        validatedConfig = plainToInstance(DevEnvironmentVariables, process.env, {
            enableImplicitConversion: true
        });
        errors = validateSync(validatedConfig, { skipMissingProperties: false });
    } else {
        validatedConfig = plainToInstance(EnvironmentVariables, process.env, {
            enableImplicitConversion: true
        });
        errors = validateSync(validatedConfig, { skipMissingProperties: false });
    }

    if (errors.length > 0) {
        throw new Error('Environment variables failed to validate\n\n' + errors.toString());
    }
}

export function validate(config: Record<string, unknown>) {
    const env = process.env.ENV;

    if (env == undefined || env == '') {
        throw Error("'ENV' environment variable missing");
    }

    if (env == Environment.Development) {
        const validatedConfig = plainToInstance(DevEnvironmentVariables, config, {
            enableImplicitConversion: true
        });
        const errors = validateSync(validatedConfig, { skipMissingProperties: false });
        if (errors.length > 0) {
            throw new Error(errors.toString());
        }

        return validatedConfig;
    } else {
        const validatedConfig = plainToInstance(EnvironmentVariables, config, {
            enableImplicitConversion: true
        });
        const errors = validateSync(validatedConfig, { skipMissingProperties: false });
        if (errors.length > 0) {
            throw new Error(errors.toString());
        }
        return validatedConfig;
    }
}

validateBootstrap();
