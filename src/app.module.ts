import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./base_modules/auth/auth.module";
import { BaseModule } from "./base_modules/base.module";
import { SharedRepositoriesModule } from "./base_modules/shared/shared.module";
import { CodeClarityModule } from "./codeclarity_modules/codeclarity.module";
import { EnterpriseModule } from "./enterprise_modules/enterprise.module";
import { MetricsModule } from "./metrics/metrics.module";
import { validate } from "./utils/validate-env";

const ENV = process.env["ENV"];

export { defaultOptions } from "./datasources/base-options";

/**
 * The main application module, responsible for importing and configuring all other modules.
 */
@Module({
  /**
   * List of imported modules.
   */
  imports: [
    // Shared repositories module - provides pure database repositories globally
    SharedRepositoriesModule,
    // Module for handling authentication-related functionality.
    AuthModule,
    // Module for managing application configuration, including environment variables and validation.
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
      envFilePath: !ENV ? "env/.env.dev" : `env/.env.${ENV}`,
      expandVariables: true,
    }),
    // Base module that provides core functionality such as user management, project management, etc.
    BaseModule,
    // Module for handling CodeClarity-related functionality, including SBOM and vulnerability reporting.
    CodeClarityModule,
    // Enterprise module that extends the platform's functionality with additional features.
    EnterpriseModule,
    // Module for exposing Prometheus metrics
    MetricsModule,
  ],
})
export class AppModule {}
