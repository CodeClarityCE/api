import { Module } from '@nestjs/common';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';
import { SbomModule } from './sbom/sbom.module';
import { PatchingModule } from './patching/patching.module';
import { LicenseModule } from './licenses/licenses.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';

@Module({
    imports: [
        OrganizationsModule,
        AnalysesModule,
        VulnerabilitiesModule,
        SbomModule,
        PatchingModule,
        LicenseModule,
    ],
})
export class ResultsModule {}