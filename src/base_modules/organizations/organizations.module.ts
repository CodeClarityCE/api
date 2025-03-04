import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsMemberService } from './organizationMember.service';
import { OrganizationLoggerService } from './organizationLogger.service';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';
import { User } from 'src/entity/codeclarity/User';
import { Log } from 'src/entity/codeclarity/Log';
import { Invitation } from 'src/entity/codeclarity/Invitation';
import { Email } from 'src/entity/codeclarity/Email';
import { EmailService } from '../email/email.service';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [OrganizationMemberships, Organization, User, Log, Invitation, Email],
            'codeclarity'
        )
    ],
    providers: [
        OrganizationsService,
        OrganizationsMemberService,
        OrganizationLoggerService,
        EmailService
    ],
    controllers: [OrganizationsController]
})
export class OrganizationsModule {}
