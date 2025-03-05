import { Module } from '@nestjs/common';
import { ProjectController } from './projects.controller';
import { ProjectMemberService } from './projectMember.service';
import { ProjectService } from './projects.service';
import { Project } from 'src/entity/codeclarity/Project';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Result } from 'src/entity/codeclarity/Result';
import { RepositoryCache } from 'src/entity/codeclarity/RepositoryCache';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsRepository } from './projects.repository';
import { FileModule } from '../file/file.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GithubModule } from '../integrations/github/github.module';
import { GitlabModule } from '../integrations/gitlab/gitlab.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        FileModule,
        IntegrationsModule,
        GithubModule,
        GitlabModule,
        TypeOrmModule.forFeature(
            [
                Project,
                Analysis,
                Result,
                RepositoryCache
            ],
            'codeclarity'
        )
    ],
    exports: [ProjectService, ProjectMemberService, ProjectsRepository],
    providers: [
        ProjectMemberService,
        ProjectService,
        ProjectsRepository,
    ],
    controllers: [ProjectController]
})
export class ProjectsModule {}
