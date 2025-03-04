import { Module } from '@nestjs/common';
import { SBOMController } from './sbom.controller';
import { SBOMService } from './sbom.service';
import { AnalysisResultsService } from '../results.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/entity/codeclarity/Result';
import { Package } from 'src/entity/knowledge/Package';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { ProjectMemberService } from 'src/base_modules/projects/projectMember.service';
import { AnalysesMemberService } from 'src/base_modules/analyses/analysesMembership.service';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Result, OrganizationMemberships, Project, Analysis],
            'codeclarity'
        ),
        TypeOrmModule.forFeature([Package], 'knowledge')
    ],
    providers: [
        SBOMService,
        AnalysisResultsService,
        OrganizationsMemberService,
        ProjectMemberService,
        AnalysesMemberService
    ],
    controllers: [SBOMController]
})
export class SbomModule {}
