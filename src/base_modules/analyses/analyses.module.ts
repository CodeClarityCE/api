import { Module } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { AnalysesMemberService } from './analysesMembership.service';
import { AnalysesController } from './analyses.controller';
import { ProjectMemberService } from '../projects/projectMember.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'src/entity/codeclarity/Project';
import { Analyzer } from 'src/entity/codeclarity/Analyzer';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Result } from 'src/entity/codeclarity/Result';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [Project, Analyzer, Analysis, Result],
            'codeclarity'
        )
    ],
    exports: [
        AnalysesService,
        AnalysesMemberService
    ],
    providers: [
        AnalysesService,
        AnalysesMemberService,
        ProjectMemberService
    ],
    controllers: [AnalysesController]
})
export class AnalysesModule {}
