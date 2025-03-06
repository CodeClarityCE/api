import { forwardRef, Module } from '@nestjs/common';
import { ProjectController } from './projects.controller';
import { ProjectMemberService } from './projectMember.service';
import { ProjectService } from './projects.service';
import { Project } from 'src/base_modules/projects/project.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { FileModule } from '../file/file.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GithubModule } from '../integrations/github/github.module';
import { GitlabModule } from '../integrations/gitlab/gitlab.module';
import { ResultsModule } from 'src/codeclarity_modules/results/results.module';
import { AnalysesModule } from '../analyses/analyses.module';
import { ProjectsRepository } from './projects.repository';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        FileModule,
        IntegrationsModule,
        GithubModule,
        GitlabModule,
        forwardRef(() => AnalysesModule),
        forwardRef(() => ResultsModule),
        TypeOrmModule.forFeature(
            [
                Project,
                RepositoryCache
            ],
            'codeclarity'
        ),
    ],
    exports: [ProjectService, ProjectMemberService, ProjectsRepository],
    providers: [
        ProjectsRepository,
        ProjectMemberService,
        ProjectService
    ],
    controllers: [ProjectController]
})
export class ProjectsModule { }
