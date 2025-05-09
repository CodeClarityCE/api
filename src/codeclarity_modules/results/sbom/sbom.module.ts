import { forwardRef, Module } from '@nestjs/common';
import { SBOMController } from './sbom.controller';
import { SBOMService } from './sbom.service';
import { AnalysisResultsService } from '../results.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { SBOMRepository } from './sbom.repository';
import { SbomUtilsService } from './utils/utils';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module';
import { KnowledgeModule } from 'src/codeclarity_modules/knowledge/knowledge.module';
import { LicenseModule } from '../licenses/licenses.module';
import { AnalysisResultsRepository } from '../results.repository';

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
