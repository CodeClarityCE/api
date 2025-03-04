import { Module } from '@nestjs/common';
import { GithubIntegrationService } from './github.service';
import { GithubRepositoriesService } from './githubRepos.service';
import { GithubIntegrationTokenService } from './githubToken.service';
import { GithubIntegrationController } from './github.controller';
import { IntegrationsService } from '../integrations.service';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { User } from 'src/entity/codeclarity/User';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';
import { Integration } from 'src/entity/codeclarity/Integration';
import { RepositoryCache } from 'src/entity/codeclarity/RepositoryCache';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [User, Organization, Integration, RepositoryCache, OrganizationMemberships],
            'codeclarity'
        )
    ],
    providers: [
        GithubIntegrationService,
        GithubRepositoriesService,
        GithubIntegrationTokenService,
        IntegrationsService,
        OrganizationsMemberService
    ],
    controllers: [GithubIntegrationController]
})
export class GithubModule {}
