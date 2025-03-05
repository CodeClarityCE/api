import { Module } from '@nestjs/common';
import { LicenseController } from './license/license.controller';
import { LicenseService } from './license/license.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/LicenseRepository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { License } from 'src/entity/knowledge/License';
import { CWERepository } from './CWERepository';
import { NPMPackageRepository } from './NPMRepository';
import { NVDRepository } from './NVDRepository';
import { OSVRepository } from './OSVRepository';
import { OWASPRepository } from './OWASPRepository';
import { PackageRepository } from './PackageRepository';
import { VersionsRepository } from './PackageVersionsRepository';
import { CWE } from 'src/entity/knowledge/CWE';
import { Package, Version } from 'src/entity/knowledge/Package';
import { NVD } from 'src/entity/knowledge/NVD';
import { OSV } from 'src/entity/knowledge/OSV';
import {
    NVDReportGenerator,
    OSVReportGenerator
} from '../results/vulnerabilities/services/reportGenerator';

@Module({
    imports: [TypeOrmModule.forFeature([License, CWE, Package, NVD, OSV, Version], 'knowledge')],
    exports: [
        LicenseService,
        LicenseRepository,
        CWERepository,
        NPMPackageRepository,
        NVDRepository,
        OSVRepository,
        OWASPRepository,
        PackageRepository,
        VersionsRepository,
        NVDReportGenerator,
        OSVReportGenerator
    ],
    providers: [
        LicenseService,
        LicenseRepository,
        CWERepository,
        NPMPackageRepository,
        NVDRepository,
        OSVRepository,
        OWASPRepository,
        PackageRepository,
        VersionsRepository,
        NVDReportGenerator,
        OSVReportGenerator
    ],
    controllers: [LicenseController]
})
export class KnowledgeModule {}
