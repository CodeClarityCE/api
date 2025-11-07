import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';
import { UsersModule } from 'src/base_modules/users/users.module';
import { IntegrationsModule } from '../integrations.module';
import { GitlabIntegrationController } from './gitlab.controller';
import { GitlabIntegrationService } from './gitlab.service';
import { GitlabRepositoriesService } from './gitlabRepos.service';
import { GitlabIntegrationTokenService } from './gitlabToken.service';

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
