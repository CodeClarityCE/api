import { Module } from '@nestjs/common';
import { LicenseController } from './license/license.controller';
import { LicenseService } from './license/license.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/license/license.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { License } from 'src/codeclarity_modules/knowledge/license/license.entity';
import { CWERepository } from './cwe/cwe.repository';
import { NPMPackageRepository } from './npm/npm.repository';
import { NVDRepository } from './nvd/nvd.repository';
import { OSVRepository } from './osv/osv.repository';
import { OWASPRepository } from './owasp/owasp.repository';
import { PackageRepository } from './package/package.repository';
import { VersionsRepository } from './package/packageVersions.repository';
import { CWE } from 'src/codeclarity_modules/knowledge/cwe/cwe.entity';
import { Package, Version } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { NVD } from 'src/codeclarity_modules/knowledge/nvd/nvd.entity';
import { OSV } from 'src/codeclarity_modules/knowledge/osv/osv.entity';
import {
    NVDReportGenerator,
    OSVReportGenerator
} from '../results/vulnerabilities/services/reportGenerator';
import { EPSS } from './epss/epss.entity';
import { EPSSRepository } from './epss/epss.repository';
import { FriendsOfPhp } from './friendsofphp/friendsofphp.entity';
import { FriendsOfPhpRepository } from './friendsofphp/friendsofphp.repository';
import { DatabaseService } from '../../services/database.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([License, CWE, Package, NVD, OSV, Version, EPSS, FriendsOfPhp], 'knowledge')
    ],
    exports: [
        LicenseRepository,
        CWERepository,
        NPMPackageRepository,
        NVDRepository,
        OSVRepository,
        OWASPRepository,
        PackageRepository,
        VersionsRepository,
        NVDReportGenerator,
        OSVReportGenerator,
        EPSSRepository,
        FriendsOfPhpRepository
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
        OSVReportGenerator,
        EPSSRepository,
        FriendsOfPhpRepository,
        DatabaseService
    ],
    controllers: [LicenseController]
})
export class KnowledgeModule {}
