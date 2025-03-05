import { Module } from '@nestjs/common';
import { GithubIntegrationService } from './github.service';
import { GithubRepositoriesService } from './githubRepos.service';
import { GithubIntegrationTokenService } from './githubToken.service';
import { GithubIntegrationController } from './github.controller';
import { IntegrationsService } from '../integrations.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { RepositoryCache } from 'src/base_modules/repository_cache/repositoryCache.entity';
import { UsersModule } from 'src/base_modules/users/users.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Integration, RepositoryCache],
            'codeclarity'
        )
    ],
    exports:[GithubRepositoriesService],
    providers: [
        GithubIntegrationService,
        GithubRepositoriesService,
        GithubIntegrationTokenService,
        IntegrationsService,
    ],
    controllers: [GithubIntegrationController]
})
export class GithubModule {}
