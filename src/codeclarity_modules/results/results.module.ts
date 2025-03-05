import { Module } from '@nestjs/common';
import { AnalysisResultsService } from './results.service';
import { ProjectMemberService } from '../../base_modules/projects/projectMember.service';
import { AnalysesMemberService } from '../../base_modules/analyses/analysesMembership.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';
import { SbomModule } from './sbom/sbom.module';
import { PatchingModule } from './patching/patching.module';
import { LicenseModule } from './licenses/licenses.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Analysis, Project],
            'codeclarity'
        ),
        VulnerabilitiesModule,
        SbomModule,
        PatchingModule,
        LicenseModule
    ],
    providers: [
        AnalysisResultsService,
        ProjectMemberService,
        AnalysesMemberService
    ],
    controllers: []
})
export class ResultsModule {}
