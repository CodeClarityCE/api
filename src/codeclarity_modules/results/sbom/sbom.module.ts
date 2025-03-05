import { Module } from '@nestjs/common';
import { SBOMController } from './sbom.controller';
import { SBOMService } from './sbom.service';
import { AnalysisResultsService } from '../results.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/entity/codeclarity/Result';
import { Package } from 'src/entity/knowledge/Package';
import { ProjectMemberService } from 'src/base_modules/projects/projectMember.service';
import { AnalysesMemberService } from 'src/base_modules/analyses/analysesMembership.service';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Result, Project, Analysis],
            'codeclarity'
        ),
        TypeOrmModule.forFeature([Package], 'knowledge')
    ],
    providers: [
        SBOMService,
        AnalysisResultsService,
        ProjectMemberService,
        AnalysesMemberService
    ],
    controllers: [SBOMController]
})
export class SbomModule {}
