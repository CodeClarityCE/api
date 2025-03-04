import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsMemberService } from './organizationMember.service';
import { OrganizationLoggerService } from './organizationLogger.service';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';
import { User } from 'src/base_modules/users/users.entity';
import { Log } from 'src/entity/codeclarity/Log';
import { Invitation } from 'src/entity/codeclarity/Invitation';
import { Email } from 'src/entity/codeclarity/Email';
import { EmailService } from '../email/email.service';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        UsersModule,
        TypeOrmModule.forFeature(
            [OrganizationMemberships, Organization, Log, Invitation, Email],
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
