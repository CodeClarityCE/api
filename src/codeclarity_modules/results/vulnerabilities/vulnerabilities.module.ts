import { Module } from '@nestjs/common';
import { FindingsService } from './vulnerabilities.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/entity/codeclarity/Result';
import { AnalysisResultsService } from '../results.service';
import { NVD } from 'src/entity/knowledge/NVD';
import { OSV } from 'src/entity/knowledge/OSV';
import { CWE } from 'src/entity/knowledge/CWE';
import { FindingsController } from './vulnerabilities.controller';
import { FindingService } from './vulnerability.service';
import { OSVRepository } from 'src/codeclarity_modules/knowledge/OSVRepository';
import { NVDRepository } from 'src/codeclarity_modules/knowledge/NVDRepository';
import { NVDReportGenerator, OSVReportGenerator } from './services/reportGenerator';
import { VersionsRepository } from 'src/codeclarity_modules/knowledge/PackageVersionsRepository';
import { CWERepository } from 'src/codeclarity_modules/knowledge/CWERepository';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/PackageRepository';
import { OWASPRepository } from 'src/codeclarity_modules/knowledge/OWASPRepository';
import { Package, Version } from 'src/entity/knowledge/Package';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';

@Module({
    imports: [
        OrganizationsModule,
        ProjectsModule,
        AnalysesModule,
        TypeOrmModule.forFeature(
            [Result],
            'codeclarity'
        ),
        TypeOrmModule.forFeature([NVD, OSV, CWE, Package, Version], 'knowledge')
    ],
    providers: [
        FindingService,
        FindingsService,
        AnalysisResultsService,
        OSVRepository,
        NVDRepository,
        OSVReportGenerator,
        NVDReportGenerator,
        VersionsRepository,
        CWERepository,
        PackageRepository,
        OWASPRepository
    ],
    controllers: [FindingsController]
})
export class VulnerabilitiesModule {}
