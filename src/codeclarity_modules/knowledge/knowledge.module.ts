import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Config } from "src/base_modules/config/config.entity";
import { CWE } from "src/codeclarity_modules/knowledge/cwe/cwe.entity";
import { License } from "src/codeclarity_modules/knowledge/license/license.entity";
import { LicenseRepository } from "src/codeclarity_modules/knowledge/license/license.repository";
import { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import {
  Package,
  Version,
} from "src/codeclarity_modules/knowledge/package/package.entity";
import { defaultOptions } from "src/datasources/base-options";

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
import { GCVE } from "./gcve/gcve.entity";
import { GCVERepository } from "./gcve/gcve.repository";
import { LicenseController } from "./license/license.controller";
import { LicenseService } from "./license/license.service";
import { NPMPackageRepository } from "./npm/npm.repository";
import { NVDRepository } from "./nvd/nvd.repository";
import { OSVRepository } from "./osv/osv.repository";
import { OWASPRepository } from "./owasp/owasp.repository";
import { OutdatedController } from "./package/outdated.controller";
import { OutdatedCheckService } from "./package/outdated.service";
import { PackageRepository } from "./package/package.repository";
import { VersionsRepository } from "./package/packageVersions.repository";
import { PackageVulnerability } from "./package-vulnerability/package-vulnerability.entity";
import { VulnerabilityCheckController } from "./package-vulnerability/vulnerability-check.controller";
import { VulnerabilityCheckService } from "./package-vulnerability/vulnerability-check.service";
import { ProvenanceController } from "./provenance/provenance.controller";
import { ProvenanceService } from "./provenance/provenance.service";
import { VulnerabilityController } from "./vulnerability/vulnerability.controller";
import { VulnerabilitySearchService } from "./vulnerability/vulnerability.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        License,
        CWE,
        Package,
        NVD,
        OSV,
        Version,
        EPSS,
        FriendsOfPhp,
        GCVE,
        PackageVulnerability,
      ],
      "knowledge",
    ),
    // Module-local connection to the config DB, which holds the knowledge
    // update timestamps written by the Go knowledge service.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      name: "config",
      useFactory: () => ({
        ...defaultOptions,
        synchronize: false,
        database: "config",
        entities: [Config],
        migrations: ["dist/migrations/config/*.js"],
      }),
    }),
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
    GCVERepository,
    VulnerabilitySearchService,
    OutdatedCheckService,
    VulnerabilityCheckService,
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
    GCVERepository,
    DatabaseService,
    VulnerabilitySearchService,
    OutdatedCheckService,
    VulnerabilityCheckService,
    ProvenanceService,
  ],
  controllers: [
    LicenseController,
    VulnerabilityController,
    OutdatedController,
    VulnerabilityCheckController,
    ProvenanceController,
  ],
})
export class KnowledgeModule {}
