import { forwardRef, Module } from '@nestjs/common';
import { GithubIntegrationService } from './github.service';
import { GithubRepositoriesService } from './githubRepos.service';
import { GithubIntegrationTokenService } from './githubToken.service';
import { GithubIntegrationController } from './github.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';
import { UsersModule } from 'src/base_modules/users/users.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { IntegrationsModule } from '../integrations.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        forwardRef(() => IntegrationsModule),
        TypeOrmModule.forFeature(
            [RepositoryCache],
            'codeclarity'
        )
    ],
    exports:[GithubRepositoriesService],
    providers: [
        GithubIntegrationService,
        GithubRepositoriesService,
        GithubIntegrationTokenService,
    ],
    controllers: [GithubIntegrationController]
})
export class GithubModule {}
