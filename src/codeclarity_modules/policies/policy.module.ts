import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DependencyPatchPolicyModule } from './dependencyPatch/dependencyPatch.module';
import { LicensePolicyModule } from './license/license.module';
import { Policy } from './policy.entity';
import { VulnerabilityPolicyModule } from './vulnerability/vulnerability.module';



@Module({
    imports: [
        LicensePolicyModule,
        DependencyPatchPolicyModule,
        VulnerabilityPolicyModule,
        TypeOrmModule.forFeature([Policy], 'codeclarity')
    ]
})
export class PolicyModule {}
