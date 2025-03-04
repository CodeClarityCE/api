import { Module } from '@nestjs/common';
import { GitlabIntegrationService } from './gitlab.service';
import { GitlabRepositoriesService } from './gitlabRepos.service';
import { GitlabIntegrationTokenService } from './gitlabToken.service';
import { GitlabIntegrationController } from './gitlab.controller';
import { IntegrationsService } from '../integrations.service';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from 'src/entity/codeclarity/Integration';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Integration, Organization, OrganizationMemberships],
            'codeclarity'
        )
    ],
    providers: [
        GitlabIntegrationService,
        GitlabRepositoriesService,
        GitlabIntegrationTokenService,
        IntegrationsService,
        OrganizationsMemberService
    ],
    controllers: [GitlabIntegrationController]
})
export class GitlabModule {}
