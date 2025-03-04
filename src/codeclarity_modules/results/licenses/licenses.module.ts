import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { Result } from 'src/entity/codeclarity/Result';
import { AnalysisResultsService } from '../results.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/LicenseRepository';
import { Package } from 'src/entity/knowledge/Package';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { ProjectMemberService } from 'src/base_modules/projects/projectMember.service';
import { AnalysesMemberService } from 'src/base_modules/analyses/analysesMembership.service';
import { License } from 'src/entity/knowledge/License';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Result, OrganizationMemberships, Project, Analysis],
            'codeclarity'
        ),
        TypeOrmModule.forFeature([Package, License], 'knowledge')
    ],
    providers: [
        LicensesService,
        AnalysisResultsService,
        LicenseRepository,
        OrganizationsMemberService,
        ProjectMemberService,
        AnalysesMemberService
    ],
    controllers: [LicensesController]
})
export class LicenseModule {}
