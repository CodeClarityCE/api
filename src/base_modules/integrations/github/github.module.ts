import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RepositoryCache } from "src/base_modules/projects/repositoryCache.entity";
import { GithubIntegrationController } from "./github.controller";
import { GithubIntegrationService } from "./github.service";
import { GithubRepositoriesService } from "./githubRepos.service";
import { GithubIntegrationTokenService } from "./githubToken.service";

@Module({
  imports: [TypeOrmModule.forFeature([RepositoryCache], "codeclarity")],
  exports: [GithubRepositoriesService],
  providers: [
    GithubIntegrationService,
    GithubRepositoriesService,
    GithubIntegrationTokenService,
  ],
  controllers: [GithubIntegrationController],
})
export class GithubModule {}
