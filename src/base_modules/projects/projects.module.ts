import { forwardRef, Module } from '@nestjs/common';
import { ProjectController } from './projects.controller';
import { ProjectMemberService } from './projectMember.service';
import { ProjectService } from './projects.service';
import { Project } from 'src/base_modules/projects/project.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsRepository } from './projects.repository';
import { FileModule } from '../file/file.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GithubModule } from '../integrations/github/github.module';
import { GitlabModule } from '../integrations/gitlab/gitlab.module';
import { ResultsModule } from 'src/codeclarity_modules/results/results.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        FileModule,
        IntegrationsModule,
        GithubModule,
        GitlabModule,
        forwardRef(() => ResultsModule),
        TypeOrmModule.forFeature(
            [
                Project,
                Analysis,
                RepositoryCache
            ],
            'codeclarity'
        ),
    ],
    exports: [ProjectService, ProjectMemberService, ProjectsRepository],
    providers: [
        ProjectMemberService,
        ProjectService,
        ProjectsRepository,
    ],
    controllers: [ProjectController]
})
export class ProjectsModule { }
