import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { AnalysisResultsService } from '../results.service';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { LicensesRepository } from './licenses.repository';
import { LicensesUtilsService } from './utils/utils';
import { KnowledgeModule } from 'src/codeclarity_modules/knowledge/knowledge.module';
import { SbomModule } from '../sbom/sbom.module';
import { AnalysisResultsRepository } from '../results.repository';

@Module({
    imports: [
        OrganizationsModule,
        forwardRef(() => ProjectsModule),
        forwardRef(() => AnalysesModule),
        KnowledgeModule,
        forwardRef(() => SbomModule),
        TypeOrmModule.forFeature([Result], 'codeclarity')
    ],
    providers: [
        LicensesService,
        AnalysisResultsService,
        AnalysisResultsRepository,
        LicensesRepository,
        LicensesUtilsService
    ],
    exports: [LicensesRepository, LicensesUtilsService],
    controllers: [LicensesController]
})
export class LicenseModule {}
