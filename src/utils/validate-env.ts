// Import necessary modules and utilities
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
import * as dotenv from 'dotenv';

/**
 * Enum representing the different environments.
 */
export enum Environment {
    Development = 'dev',
    Production = 'prod',
    Staging = 'staging',
    Test = 'test'
}

/**
 * Class representing the environment variables.
 */
class EnvironmentVariables {
    /**
     * The current environment (e.g. dev, prod).
     */
    @IsEnum(Environment)
    ENV!: Environment;

    /**
     * The port number to listen on.
     */
    @IsNumber()
    @Transform(({ value }) => parseInt(value, 10))
    PORT!: number;

    /**
     * The hostname or IP address to bind to.
     */
    @IsNotEmpty()
    HOST!: string;

    // Github oauth
    /**
     * The client ID for GitHub OAuth.
     */
    @IsNotEmpty()
    GITHUB_AUTH_CLIENT_ID!: string;

    /**
     * The client secret for GitHub OAuth.
     */
    @IsNotEmpty()
    GITHUB_AUTH_CLIENT_SECRET!: string;

    // Gitlab oauth
    /**
     * The client ID for GitLab OAuth.
     */
    @IsNotEmpty()
    GITLAB_AUTH_CLIENT_ID!: string;

    /**
     * The client secret for GitLab OAuth.
     */
    @IsNotEmpty()
    GITLAB_AUTH_CLIENT_SECRET!: string;

    /**
     * The hostname or IP address of the GitLab instance.
     */
    @IsNotEmpty()
    GITLAB_AUTH_HOST!: string;

    // Authentication
    /**
     * The callback URL for GitHub authentication.
     */
    @IsNotEmpty()
    GITHUB_AUTH_CALLBACK!: string;

    /**
     * The callback URL for GitLab authentication.
     */
    @IsNotEmpty()
    GITLAB_AUTH_CALLBACK!: string;

    // AMQP
    /**
     * The name of the queue to connect to.
     */
    @IsNotEmpty()
    AMQP_ANALYSES_QUEUE!: string;

    /**
     * The protocol to use (e.g. amqp, rabbitmq).
     */
    @IsNotEmpty()
    AMQP_PROTOCOL!: string;

    /**
     * The hostname or IP address of the AMQP broker.
     */
    @IsNotEmpty()
    AMQP_HOST!: string;

    /**
     * The port number to connect on.
     */
    @IsNotEmpty()
    AMQP_PORT!: string;

    /**
     * The username to use for authentication.
     */
    @IsNotEmpty()
    AMQP_USER!: string;

    /**
     * The password to use for authentication.
     */
    @IsNotEmpty()
    AMQP_PASSWORD!: string;

    // Email
    /**
     * The hostname or IP address of the mail server.
     */
    @IsNotEmpty()
    MAIL_HOST!: string;

    /**
     * The port number to connect on.
     */
    @IsNumber()
    @Transform(({ value }) => parseInt(value, 10))
    MAIL_PORT!: number;

    /**
     * The username for authentication with the mail server.
     */
    @IsNotEmpty()
    MAIL_AUTH_USER!: string;

    /**
     * The password for authentication with the mail server.
     */
    @IsNotEmpty()
    MAIL_AUTH_PASSWORD!: string;

    /**
     * The default "from" email address.
     */
    @IsNotEmpty()
    MAIL_DEFAULT_FROM!: string;

    // Database
    /**
     * A secret key used for cookie signing and other purposes.
     */
    @IsNotEmpty()
    COOKIE_SECRET!: string;

    /**
     * The callback URL for GitHub authentication (again).
     */
    @IsNotEmpty()
    GITHUB_CALLBACK!: string;

    /**
     * The callback URL for GitLab authentication (again).
     */
    @IsNotEmpty()
    GITLAB_CALLBACK!: string;

    /**
     * The hostname or IP address of the web server.
     */
    @IsNotEmpty()
    WEB_HOST!: string;

    /**
     * The name of the platform (e.g. GitHub, GitLab).
     */
    @IsNotEmpty()
    PLATFORM_NAME!: string;
}

/**
 * Class representing environment variables specific to development environments.
 */
class DevEnvironmentVariables extends EnvironmentVariables {
    /**
     * An email address used for testing purposes.
     */
    @IsNotEmpty()
    @IsEmail()
    TEST_EMAIL!: string;

    /**
     * A boolean indicating whether account verification is required.
     */
    @IsNotEmpty()
    @Transform(
        (v) => {
            return v.obj.REQUIRE_ACCOUNT_VERIFICATION === 'true' ? true : false;
        },
        { toClassOnly: true }
    )
    REQUIRE_ACCOUNT_VERIFICATION!: boolean;
}

/**
 * Function that validates the environment variables and throws an error if they are invalid.
 */
function validateBootstrap() {
    const env = process.env['ENV'];

    // Check if the 'ENV' environment variable is set
    let errors: ValidationError[] = [];
    let validatedConfig: EnvironmentVariables;

    if (env === undefined || env === '') {
        throw Error("'ENV' environment variable missing");
    }

    // Load config from .env files based on the current environment
    let res;
    if (env === 'dev') {
        res = dotenv.config({ path: 'env/.env.dev', override: false });
    } else if (env === 'prod') {
        res = dotenv.config({ path: 'env/.env.prod', override: false });
    } else if (env === 'staging') {
        res = dotenv.config({ path: 'env/.env.staging', override: false });
    } else if (env === 'test') {
        res = dotenv.config({ path: 'env/.env.test', override: false });
    }

    // Check if there were any errors loading the config
    if (res?.error) {
        throw res.error;
    }

    // Type-cast env to Environment for type-safe comparison
    const typedEnv = env as Environment;

    // Determine which class to use for validation based on the environment
    if (typedEnv === Environment.Development) {
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

    // Check if there were any validation errors
    if (errors.length > 0) {
        throw new Error(`Environment variables failed to validate\n\n${  errors.toString()}`);
    }
}

/**
 * Function that validates a given configuration object and returns the validated instance.
 */
export function validate(config: Record<string, unknown>) {
    const env = process.env['ENV'];

    // Check if the 'ENV' environment variable is set
    if (env === undefined || env === '') {
        throw Error("'ENV' environment variable missing");
    }

    // Type-cast env to Environment for type-safe comparison
    const typedEnv = env as Environment;

    // Determine which class to use for validation based on the environment
    if (typedEnv === Environment.Development) {
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

// Call the bootstrap function to initialize the environment variables
validateBootstrap();
