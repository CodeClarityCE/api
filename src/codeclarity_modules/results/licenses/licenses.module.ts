import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { Result } from 'src/entity/codeclarity/Result';
import { AnalysisResultsService } from '../results.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/LicenseRepository';
import { Package } from 'src/entity/knowledge/Package';
import { ProjectMemberService } from 'src/base_modules/projects/projectMember.service';
import { AnalysesMemberService } from 'src/base_modules/analyses/analysesMembership.service';
import { License } from 'src/entity/knowledge/License';
import { OrganizationMemberships } from 'src/base_modules/organizations/organization.memberships.entity';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        OrganizationsModule,
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
        ProjectMemberService,
        AnalysesMemberService
    ],
    controllers: [LicensesController]
})
export class LicenseModule {}
