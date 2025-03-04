import { Module } from '@nestjs/common';
import { ProjectController } from './projects.controller';
import { ProjectMemberService } from './projectMember.service';
import { ProjectService } from './projects.service';
import { Project } from 'src/entity/codeclarity/Project';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationLoggerService } from '../organizations/organizationLogger.service';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { GithubRepositoriesService } from '../integrations/github/githubRepos.service';
import { GitlabRepositoriesService } from '../integrations/gitlab/gitlabRepos.service';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Organization } from 'src/entity/codeclarity/Organization';
import { Result } from 'src/entity/codeclarity/Result';
import { Integration } from 'src/entity/codeclarity/Integration';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Log } from 'src/entity/codeclarity/Log';
import { IntegrationsService } from '../integrations/integrations.service';
import { RepositoryCache } from 'src/entity/codeclarity/RepositoryCache';
import { GithubIntegrationService } from '../integrations/github/github.service';
import { GitlabIntegrationService } from '../integrations/gitlab/gitlab.service';
import { GithubIntegrationTokenService } from '../integrations/github/githubToken.service';
import { GitlabIntegrationTokenService } from '../integrations/gitlab/gitlabToken.service';
import { File } from 'src/entity/codeclarity/File';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        UsersModule,
        TypeOrmModule.forFeature(
            [
                Project,
                Analysis,
                Organization,
                Result,
                Integration,
                OrganizationMemberships,
                Log,
                RepositoryCache,
                File
            ],
            'codeclarity'
        )
    ],
    exports: [ProjectService],
    providers: [
        ProjectMemberService,
        ProjectService,
        OrganizationLoggerService,
        OrganizationsMemberService,
        GithubRepositoriesService,
        GitlabRepositoriesService,
        GithubIntegrationService,
        GitlabIntegrationService,
        GithubIntegrationTokenService,
        GitlabIntegrationTokenService,
        IntegrationsService
    ],
    controllers: [ProjectController]
})
export class ProjectsModule {}
