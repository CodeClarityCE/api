import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';
import { UsersModule } from 'src/base_modules/users/users.module';
import { IntegrationsModule } from '../integrations.module';
import { GithubIntegrationController } from './github.controller';
import { GithubIntegrationService } from './github.service';
import { GithubRepositoriesService } from './githubRepos.service';
import { GithubIntegrationTokenService } from './githubToken.service';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        forwardRef(() => IntegrationsModule),
        OrganizationsModule,
        TypeOrmModule.forFeature([RepositoryCache], 'codeclarity')
    ],
    exports: [GithubRepositoriesService],
    providers: [GithubIntegrationService, GithubRepositoriesService, GithubIntegrationTokenService],
    controllers: [GithubIntegrationController]
})
export class GithubModule {}
