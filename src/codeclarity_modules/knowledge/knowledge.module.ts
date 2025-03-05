import { Module } from '@nestjs/common';
import { LicenseController } from './license/license.controller';
import { LicenseService } from './license/license.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/license/license.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { License } from 'src/entity/knowledge/License';
import { CWERepository } from './cwe/cwe.repository';
import { NPMPackageRepository } from './npm/npm.repository';
import { NVDRepository } from './nvd/nvd.repository';
import { OSVRepository } from './osv/osv.repository';
import { OWASPRepository } from './owasp/owasp.repository';
import { PackageRepository } from './package/package.repository';
import { VersionsRepository } from './package/packageVersions.repository';
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
        CWERepository,
        NVDRepository,
        OSVRepository,
        OWASPRepository,
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
