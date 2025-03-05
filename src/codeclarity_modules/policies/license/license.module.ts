import { Module } from '@nestjs/common';
import { LicensePolicyController } from './license.controller';
import { LicensePolicyService } from './license.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from 'src/entity/codeclarity/Policy';
import { User } from 'src/base_modules/users/users.entity';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Policy, User],
            'codeclarity'
        )
    ],
    providers: [LicensePolicyService],
    controllers: [LicensePolicyController]
})
export class LicensePolicyModule {}
