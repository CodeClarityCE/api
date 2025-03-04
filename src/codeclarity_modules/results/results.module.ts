import { Module } from '@nestjs/common';
import { AnalysisResultsService } from './results.service';
import { OrganizationsMemberService } from '../../base_modules/organizations/organizationMember.service';
import { ProjectMemberService } from '../../base_modules/projects/projectMember.service';
import { AnalysesMemberService } from '../../base_modules/analyses/analysesMembership.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';
import { SbomModule } from './sbom/sbom.module';
import { PatchingModule } from './patching/patching.module';
import { LicenseModule } from './licenses/licenses.module';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Analysis, Organization, Project, OrganizationMemberships],
            'codeclarity'
        ),
        VulnerabilitiesModule,
        SbomModule,
        PatchingModule,
        LicenseModule
    ],
    providers: [
        AnalysisResultsService,
        OrganizationsMemberService,
        ProjectMemberService,
        AnalysesMemberService
    ],
    controllers: []
})
export class ResultsModule {}
