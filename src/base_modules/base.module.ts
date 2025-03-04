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
import { User } from 'src/entity/codeclarity/User';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Organization } from 'src/entity/codeclarity/Organization';
import { Policy } from 'src/entity/codeclarity/Policy';
import { Analyzer } from 'src/entity/codeclarity/Analyzer';
import { Integration } from 'src/entity/codeclarity/Integration';
import { Log } from 'src/entity/codeclarity/Log';
import { Notification } from 'src/entity/codeclarity/Notification';
import { Project } from 'src/entity/codeclarity/Project';
import { Result } from 'src/entity/codeclarity/Result';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { RepositoryCache } from 'src/entity/codeclarity/RepositoryCache';
import { Email } from 'src/entity/codeclarity/Email';
import { Invitation } from 'src/entity/codeclarity/Invitation';
import { File } from 'src/entity/codeclarity/File';

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
