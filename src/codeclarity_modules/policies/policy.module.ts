import { Module } from '@nestjs/common';
import { LicensePolicyModule } from './license/license.module';
import { DependencyPatchPolicyModule } from './dependencyPatch/dependencyPatch.module';
import { VulnerabilityPolicyModule } from './vulnerability/vulnerability.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from './policy.entity';

@Module({
    imports: [
        LicensePolicyModule,
        DependencyPatchPolicyModule,
        VulnerabilityPolicyModule,
        TypeOrmModule.forFeature([Policy], 'codeclarity')
    ]
})
export class PolicyModule {}
