import { Module } from '@nestjs/common';
import { EmailModule } from '../base_modules/email/email.module';
import { AuthModule } from '../base_modules/auth/auth.module';
import { UsersModule } from '../base_modules/users/users.module';
import { ProjectsModule } from '../base_modules/projects/projects.module';
import { IntegrationsModule } from '../base_modules/integrations/integrations.module';
import { PluginModule } from '../base_modules/plugins/plugin.module';
import { AnalysesModule } from '../base_modules/analyses/analyses.module';
import { FileModule } from '../base_modules/file/file.module';
import { NotificationsModule } from '../base_modules/notifications/notifications.module';
import { AnalyzersModule } from '../base_modules/analyzers/analyzers.module';
import { ApiKeysModule } from '../base_modules/apiKeys/apiKeys.module';
import { OrganizationsModule } from '../base_modules/organizations/organizations.module';

@Module({
    imports: [
        EmailModule,
        AuthModule,
        UsersModule,
        ProjectsModule,
        IntegrationsModule,
        PluginModule,
        AnalysesModule,
        FileModule,
        NotificationsModule,
        AnalyzersModule,
        ApiKeysModule,
        OrganizationsModule,
    ]
})
export class BaseModule {}
