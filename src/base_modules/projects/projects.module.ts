import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Project } from "src/base_modules/projects/project.entity";
import { RepositoryCache } from "src/base_modules/projects/repositoryCache.entity";
import { ResultsModule } from "src/codeclarity_modules/results/results.module";
import { AnalysesModule } from "../analyses/analyses.module";
import { FileModule } from "../file/file.module";
import { GithubModule } from "../integrations/github/github.module";
import { GitlabModule } from "../integrations/gitlab/gitlab.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProjectMemberService } from "./projectMember.service";
import { ProjectController } from "./projects.controller";
import { ProjectsRepository } from "./projects.repository";
import { ProjectService } from "./projects.service";

@Module({
  imports: [
    OrganizationsModule, // For OrganizationLoggerService
    FileModule,
    IntegrationsModule,
    GithubModule,
    GitlabModule,
    forwardRef(() => AnalysesModule),
    forwardRef(() => ResultsModule),
    TypeOrmModule.forFeature([Project, RepositoryCache], "codeclarity"),
  ],
  exports: [ProjectService, ProjectMemberService, ProjectsRepository],
  providers: [ProjectsRepository, ProjectMemberService, ProjectService],
  controllers: [ProjectController],
})
export class ProjectsModule {}
