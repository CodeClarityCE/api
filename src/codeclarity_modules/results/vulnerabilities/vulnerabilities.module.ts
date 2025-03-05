import { forwardRef, Module } from '@nestjs/common';
import { FindingsService } from './vulnerabilities.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { AnalysisResultsService } from '../results.service';
import { NVD } from 'src/codeclarity_modules/knowledge/nvd/nvd.entity';
import { OSV } from 'src/codeclarity_modules/knowledge/osv/osv.entity';
import { CWE } from 'src/codeclarity_modules/knowledge/cwe/cwe.entity';
import { FindingsController } from './vulnerabilities.controller';
import { FindingService } from './vulnerability.service';
import { Package, Version } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { KnowledgeModule } from 'src/codeclarity_modules/knowledge/knowledge.module';
import { FindingsRepository } from './vulnerabilities.repository';

@Module({
    imports: [
        OrganizationsModule,
        ProjectsModule,
        forwardRef(() => AnalysesModule),
        KnowledgeModule,
        TypeOrmModule.forFeature(
            [Result],
            'codeclarity'
        ),
        TypeOrmModule.forFeature([NVD, OSV, CWE], 'knowledge')
    ],
    exports: [FindingsRepository],
    providers: [
        FindingService,
        FindingsService,
        AnalysisResultsService,
        FindingsRepository
    ],
    controllers: [FindingsController]
})
export class VulnerabilitiesModule {}
