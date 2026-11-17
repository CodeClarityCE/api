import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { OrganizationsModule } from "src/base_modules/organizations/organizations.module";
import { RepositoryCache } from "src/base_modules/projects/repositoryCache.entity";

import { GitlabIntegrationController } from "./gitlab.controller";
import { GitlabIntegrationService } from "./gitlab.service";
import { GitlabRepositoriesService } from "./gitlabRepos.service";
import { GitlabIntegrationTokenService } from "./gitlabToken.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([RepositoryCache], "codeclarity"),
    OrganizationsModule, // For OrganizationLoggerService
  ],
  exports: [GitlabRepositoriesService],
  providers: [
    GitlabIntegrationService,
    GitlabRepositoriesService,
    GitlabIntegrationTokenService,
  ],
  controllers: [GitlabIntegrationController],
})
export class GitlabModule {}
