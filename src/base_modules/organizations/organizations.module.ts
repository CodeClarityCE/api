import { forwardRef, Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationLoggerService } from './organizationLogger.service';
import { OrganizationMemberships } from 'src/base_modules/organizations/organization.memberships.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { Log } from 'src/base_modules/organizations/log.entity';
import { Invitation } from 'src/base_modules/organizations/invitation.entity';
import { UsersModule } from '../users/users.module';
import { OrganizationsRepository } from './organizations.repository';
import { EmailModule } from '../email/email.module';
import { InvitationsRepository } from './invitations.repository';
import { LogsRepository } from './logs.repository';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        EmailModule,
        TypeOrmModule.forFeature(
            [OrganizationMemberships, Organization, Log, Invitation],
            'codeclarity'
        ),
    ],
    exports: [OrganizationsRepository, OrganizationLoggerService],
    providers: [
        OrganizationsService,
        OrganizationLoggerService,
        OrganizationsRepository,
        InvitationsRepository,
        LogsRepository
    ],
    controllers: [OrganizationsController]
})
export class OrganizationsModule { }
