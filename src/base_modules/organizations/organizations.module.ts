import { forwardRef, Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationLoggerService } from './organizationLogger.service';
import { OrganizationMemberships } from 'src/base_modules/organizations/organization.memberships.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { Log } from 'src/entity/codeclarity/Log';
import { Invitation } from 'src/entity/codeclarity/Invitation';
import { UsersModule } from '../users/users.module';
import { OrganizationsRepository } from './organizations.repository';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        EmailModule,
        TypeOrmModule.forFeature(
            [OrganizationMemberships, Organization, Log, Invitation],
            'codeclarity'
        )
    ],
    exports: [OrganizationsRepository, OrganizationLoggerService],
    providers: [
        OrganizationsService,
        OrganizationLoggerService,
        OrganizationsRepository
    ],
    controllers: [OrganizationsController]
})
export class OrganizationsModule {}
