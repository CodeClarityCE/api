import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { KnowledgeModule } from 'src/codeclarity_modules/knowledge/knowledge.module';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { LicenseModule } from '../licenses/licenses.module';
import { AnalysisResultsRepository } from '../results.repository';
import { AnalysisResultsService } from '../results.service';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module';
import { SBOMController } from './sbom.controller';
import { SBOMRepository } from './sbom.repository';
import { SBOMService } from './sbom.service';
import { SbomUtilsService } from './utils/utils';

@Module({
    imports: [
        OrganizationsModule,
        forwardRef(() => AnalysesModule),
        forwardRef(() => ProjectsModule),
        forwardRef(() => VulnerabilitiesModule),
        forwardRef(() => LicenseModule),
        KnowledgeModule,
        TypeOrmModule.forFeature([Result], 'codeclarity')
    ],
    exports: [SBOMRepository, SbomUtilsService],
    providers: [
        SBOMService,
        AnalysisResultsService,
        SBOMRepository,
        SbomUtilsService,
        AnalysisResultsRepository
    ],
    controllers: [SBOMController]
})
export class SbomModule {}
