import { forwardRef, Module } from '@nestjs/common';
import { GitlabIntegrationService } from './gitlab.service';
import { GitlabRepositoriesService } from './gitlabRepos.service';
import { GitlabIntegrationTokenService } from './gitlabToken.service';
import { GitlabIntegrationController } from './gitlab.controller';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { IntegrationsModule } from '../integrations.module';
import { UsersModule } from 'src/base_modules/users/users.module';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        forwardRef(() => IntegrationsModule),
        OrganizationsModule,
        TypeOrmModule.forFeature([RepositoryCache], 'codeclarity')
    ],
    exports: [GitlabRepositoriesService],
    providers: [GitlabIntegrationService, GitlabRepositoriesService, GitlabIntegrationTokenService],
    controllers: [GitlabIntegrationController]
})
export class GitlabModule {}
