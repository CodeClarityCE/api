import { Module } from '@nestjs/common';
import { LicensePolicyController } from './license.controller';
import { LicensePolicyService } from './license.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { Policy } from 'src/entity/codeclarity/Policy';
import { User } from 'src/entity/codeclarity/User';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Organization, Policy, User, OrganizationMemberships],
            'codeclarity'
        )
    ],
    providers: [LicensePolicyService, OrganizationsMemberService],
    controllers: [LicensePolicyController]
})
export class LicensePolicyModule {}
