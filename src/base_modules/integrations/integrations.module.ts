import { Module } from '@nestjs/common';
import { GitlabModule } from './gitlab/gitlab.module';
import { GithubModule } from './github/github.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { Integration } from 'src/entity/codeclarity/Integration';
import { Organization } from 'src/entity/codeclarity/Organization';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [OrganizationMemberships, Integration, Organization],
            'codeclarity'
        ),
        GitlabModule,
        GithubModule,
        OrganizationsModule
    ],
    providers: [IntegrationsService, OrganizationsMemberService],
    controllers: [IntegrationsController]
})
export class IntegrationsModule {}
