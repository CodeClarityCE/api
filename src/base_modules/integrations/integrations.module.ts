import { Module } from '@nestjs/common';
import { GitlabModule } from './gitlab/gitlab.module';
import { GithubModule } from './github/github.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { IntegrationsRepository } from './integrations.repository';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Integration],
            'codeclarity'
        ),
        GitlabModule,
        GithubModule,
        OrganizationsModule
    ],
    exports: [IntegrationsRepository, IntegrationsService],
    providers: [IntegrationsService, IntegrationsRepository],
    controllers: [IntegrationsController]
})
export class IntegrationsModule { }
