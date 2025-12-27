import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CWE } from "src/codeclarity_modules/knowledge/cwe/cwe.entity";
import { License } from "src/codeclarity_modules/knowledge/license/license.entity";
import { LicenseRepository } from "src/codeclarity_modules/knowledge/license/license.repository";
import { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import {
  Package,
  Version,
} from "src/codeclarity_modules/knowledge/package/package.entity";
import { DatabaseService } from "../../services/database.service";
import {
  NVDReportGenerator,
  OSVReportGenerator,
} from "../results/vulnerabilities/services/reportGenerator";
import { CWERepository } from "./cwe/cwe.repository";
import { EPSS } from "./epss/epss.entity";
import { EPSSRepository } from "./epss/epss.repository";
import { FriendsOfPhp } from "./friendsofphp/friendsofphp.entity";
import { FriendsOfPhpRepository } from "./friendsofphp/friendsofphp.repository";
import { LicenseController } from "./license/license.controller";
import { LicenseService } from "./license/license.service";
import { NPMPackageRepository } from "./npm/npm.repository";
import { NVDRepository } from "./nvd/nvd.repository";
import { OSVRepository } from "./osv/osv.repository";
import { OWASPRepository } from "./owasp/owasp.repository";
import { PackageRepository } from "./package/package.repository";
import { VersionsRepository } from "./package/packageVersions.repository";
import { VulnerabilityController } from "./vulnerability/vulnerability.controller";
import { VulnerabilitySearchService } from "./vulnerability/vulnerability.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [License, CWE, Package, NVD, OSV, Version, EPSS, FriendsOfPhp],
      "knowledge",
    ),
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
    FriendsOfPhpRepository,
    VulnerabilitySearchService,
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
    DatabaseService,
    VulnerabilitySearchService,
  ],
  controllers: [LicenseController, VulnerabilityController],
})
export class KnowledgeModule {}
