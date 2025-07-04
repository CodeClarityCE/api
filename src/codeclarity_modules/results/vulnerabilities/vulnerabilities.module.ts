import { forwardRef, Module } from '@nestjs/common';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { AnalysisResultsService } from '../results.service';
import { FindingsController } from './vulnerabilities.controller';
import { VulnerabilityService } from './vulnerability.service';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { KnowledgeModule } from 'src/codeclarity_modules/knowledge/knowledge.module';
import { VulnerabilitiesRepository } from './vulnerabilities.repository';
import { VulnerabilitiesUtilsService } from './utils/utils.service';
import { PatchingModule } from '../patching/patching.module';
import { SbomModule } from '../sbom/sbom.module';
import { VulnerabilitiesSortService } from './utils/sort.service';
import { VulnerabilitiesFilterService } from './utils/filter.service';
import { AnalysisResultsRepository } from '../results.repository';

@Module({
    imports: [
        OrganizationsModule,
        forwardRef(() => ProjectsModule),
        forwardRef(() => AnalysesModule),
        KnowledgeModule,
        PatchingModule,
        SbomModule,
        TypeOrmModule.forFeature([Result], 'codeclarity')
    ],
    exports: [VulnerabilitiesRepository, VulnerabilitiesUtilsService],
    providers: [
        VulnerabilityService,
        VulnerabilitiesService,
        AnalysisResultsService,
        VulnerabilitiesUtilsService,
        VulnerabilitiesSortService,
        VulnerabilitiesFilterService,
        VulnerabilitiesRepository,
        AnalysisResultsRepository
    ],
    controllers: [FindingsController]
})
export class VulnerabilitiesModule {}
