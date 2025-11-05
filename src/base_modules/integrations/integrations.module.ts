
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from 'src/base_modules/integrations/integrations.entity';

import { OrganizationsModule } from '../organizations/organizations.module';

import { GithubModule } from './github/github.module';
import { GitlabModule } from './gitlab/gitlab.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService } from './integrations.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Integration], 'codeclarity'),
        GitlabModule,
        GithubModule,
        OrganizationsModule
    ],
    exports: [IntegrationsRepository, IntegrationsService],
    providers: [IntegrationsService, IntegrationsRepository],
    controllers: [IntegrationsController]
})
export class IntegrationsModule {}
