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
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { defaultOptions } from 'src/app.module';
import { User } from 'src/base_modules/users/users.entity';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { Policy } from 'src/codeclarity_modules/policies/policy.entity';
import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { Log } from 'src/base_modules/organizations/log.entity';
import { Notification } from 'src/base_modules/notifications/notification.entity';
import { Project } from 'src/base_modules/projects/project.entity';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { OrganizationMemberships } from 'src/base_modules/organizations/organization.memberships.entity';
import { RepositoryCache } from 'src/base_modules/repository_cache/repositoryCache.entity';
import { Email } from 'src/base_modules/email/email.entity';
import { Invitation } from 'src/base_modules/invitations/invitation.entity';
import { File } from 'src/base_modules/file/file.entity';

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
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'codeclarity',
            useFactory: () => ({
                ...defaultOptions,
                autoLoadEntities: true,
                database: 'codeclarity',
                entities: [
                    Notification,
                    User,
                    Analysis,
                    Organization,
                    Policy,
                    Analyzer,
                    Integration,
                    Log,
                    Project,
                    Result,
                    OrganizationMemberships,
                    RepositoryCache,
                    Email,
                    Invitation,
                    File
                ]
            })
        }),
    ],
    providers: [],
    controllers: []
})
export class BaseModule {}
