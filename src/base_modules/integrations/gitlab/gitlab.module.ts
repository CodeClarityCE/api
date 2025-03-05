import { forwardRef, Module } from '@nestjs/common';
import { GitlabIntegrationService } from './gitlab.service';
import { GitlabRepositoriesService } from './gitlabRepos.service';
import { GitlabIntegrationTokenService } from './gitlabToken.service';
import { GitlabIntegrationController } from './gitlab.controller';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { IntegrationsModule } from '../integrations.module';

@Module({
    imports: [
        OrganizationsModule,
        forwardRef(() => IntegrationsModule)
    ],
    exports:[GitlabRepositoriesService],
    providers: [
        GitlabIntegrationService,
        GitlabRepositoriesService,
        GitlabIntegrationTokenService,
    ],
    controllers: [GitlabIntegrationController]
})
export class GitlabModule {}
