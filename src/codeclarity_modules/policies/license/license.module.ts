import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { UsersModule } from 'src/base_modules/users/users.module';
import { Policy } from 'src/codeclarity_modules/policies/policy.entity';

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LicensePolicyController } from './license.controller';
import { LicensePolicyService } from './license.service';

@Module({
    imports: [OrganizationsModule, UsersModule, TypeOrmModule.forFeature([Policy], 'codeclarity')],
    providers: [LicensePolicyService],
    controllers: [LicensePolicyController]
})
export class LicensePolicyModule {}
