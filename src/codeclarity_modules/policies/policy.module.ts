import { Module } from '@nestjs/common';
import { LicensePolicyModule } from './license/license.module';
import { DependencyPatchPolicyModule } from './dependencyPatch/dependencyPatch.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from './policy.entity';

@Module({
    imports: [
        LicensePolicyModule,
        DependencyPatchPolicyModule,
        TypeOrmModule.forFeature(
            [Policy],
            'codeclarity'
        ),
    ],
    providers: [],
    controllers: []
})
export class PolicyModule { }
