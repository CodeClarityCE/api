import { Module } from '@nestjs/common';
import { FindingsService } from './vulnerabilities.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/entity/codeclarity/Result';
import { AnalysisResultsService } from '../results.service';
import { NVD } from 'src/entity/knowledge/NVD';
import { OSV } from 'src/entity/knowledge/OSV';
import { CWE } from 'src/entity/knowledge/CWE';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { ProjectMemberService } from 'src/base_modules/projects/projectMember.service';
import { AnalysesMemberService } from 'src/base_modules/analyses/analysesMembership.service';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';
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

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Result, OrganizationMemberships, Project, Analysis],
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
        OrganizationsMemberService,
        ProjectMemberService,
        AnalysesMemberService,
        PackageRepository,
        OWASPRepository
    ],
    controllers: [FindingsController]
})
export class VulnerabilitiesModule {}
