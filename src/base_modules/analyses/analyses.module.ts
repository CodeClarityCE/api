import { Module } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { AnalysesMemberService } from './analysesMembership.service';
import { AnalysesController } from './analyses.controller';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { ProjectMemberService } from '../projects/projectMember.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'src/entity/codeclarity/Project';
import { Analyzer } from 'src/entity/codeclarity/Analyzer';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Organization } from 'src/entity/codeclarity/Organization';
import { Result } from 'src/entity/codeclarity/Result';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        UsersModule,
        TypeOrmModule.forFeature(
            [Project, Analyzer, Analysis, Organization, Result, OrganizationMemberships],
            'codeclarity'
        )
    ],
    exports: [
        AnalysesService
    ],
    providers: [
        AnalysesService,
        AnalysesMemberService,
        OrganizationsMemberService,
        ProjectMemberService
    ],
    controllers: [AnalysesController]
})
export class AnalysesModule {}
