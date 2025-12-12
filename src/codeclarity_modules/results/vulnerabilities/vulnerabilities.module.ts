import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { KnowledgeModule } from 'src/codeclarity_modules/knowledge/knowledge.module';
import { VulnerabilityPolicyModule } from 'src/codeclarity_modules/policies/vulnerability/vulnerability.module';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { PatchingModule } from '../patching/patching.module';
import { AnalysisResultsRepository } from '../results.repository';
import { AnalysisResultsService } from '../results.service';
import { SbomModule } from '../sbom/sbom.module';
import { VulnerabilitiesFilterService } from './utils/filter.service';
import { VulnerabilitiesSortService } from './utils/sort.service';
import { VulnerabilitiesUtilsService } from './utils/utils.service';
import { FindingsController } from './vulnerabilities.controller';
import { VulnerabilitiesRepository } from './vulnerabilities.repository';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityService } from './vulnerability.service';

@Module({
    imports: [
        OrganizationsModule,
        KnowledgeModule,
        forwardRef(() => PatchingModule),
        forwardRef(() => SbomModule),
        forwardRef(() => VulnerabilityPolicyModule),
        TypeOrmModule.forFeature([Result], 'codeclarity')
    ],
    exports: [VulnerabilitiesRepository, VulnerabilitiesUtilsService, VulnerabilityService],
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
