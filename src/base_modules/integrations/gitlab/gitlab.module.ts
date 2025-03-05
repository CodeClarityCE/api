import { Module } from '@nestjs/common';
import { GitlabIntegrationService } from './gitlab.service';
import { GitlabRepositoriesService } from './gitlabRepos.service';
import { GitlabIntegrationTokenService } from './gitlabToken.service';
import { GitlabIntegrationController } from './gitlab.controller';
import { IntegrationsService } from '../integrations.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Integration],
            'codeclarity'
        )
    ],
    exports:[GitlabRepositoriesService],
    providers: [
        GitlabIntegrationService,
        GitlabRepositoriesService,
        GitlabIntegrationTokenService,
        IntegrationsService,
    ],
    controllers: [GitlabIntegrationController]
})
export class GitlabModule {}
