import { Injectable } from '@nestjs/common';
import { PaginatedResponse } from 'src/types/apiResponses';
import { AuthenticatedUser } from 'src/types/auth/types';
import { AnalysisResultsService } from '../results.service';
import { paginate } from 'src/codeclarity_modules/results/utils/utils';
import { Output as LicensesOutput } from 'src/types/entities/services/Licenses';
import { LicenseInfo, DepShortInfo } from 'src/types/entities/frontend/Licenses';
import { filter } from 'src/codeclarity_modules/results/licenses/utils/filter';
import { sort } from 'src/codeclarity_modules/results/licenses/utils/sort';
import { Output as SbomOutput } from 'src/types/entities/services/Sbom';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/LicenseRepository';
import { getLicensesResult } from './utils/utils';
import { UnknownWorkspace } from 'src/types/errors/types';
import { getSbomResult } from '../sbom/utils/utils';
import { StatusResponse } from 'src/types/entities/services/Status';
import { Package, Version } from 'src/entity/knowledge/Package';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Result } from 'src/entity/codeclarity/Result';

@Injectable()
export class LicensesService {
    constructor(
        private readonly analysisResultsService: AnalysisResultsService,
        private readonly licenseRepository: LicenseRepository,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getLicensesUsed(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string,
        page: number | undefined,
        entries_per_page: number | undefined,
        sort_by: string | undefined,
        sort_direction: string | undefined,
        active_filters_string: string | undefined,
        search_key: string | undefined
    ): Promise<PaginatedResponse> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string != null)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        const licensesOutput: LicensesOutput = await getLicensesResult(
            analysisId,
            this.resultRepository
        );

        const licensesWorkspaceInfo = licensesOutput.workspaces[workspace];
        const licenseMap: { [key: string]: LicenseInfo } = {};

        for (const [licenseId, depsUsingLicense] of Object.entries(
            licensesWorkspaceInfo.LicensesDepMap
        )) {
            const licenseInfo: LicenseInfo = {
                id: licenseId,
                license_compliance_violation:
                    licensesWorkspaceInfo.LicenseComplianceViolations.includes(licenseId),
                unable_to_infer: licenseId in licensesWorkspaceInfo.NonSpdxLicensesDepMap,
                name: '',
                description: '',
                deps_using_license: Array.from(new Set(depsUsingLicense)),
                license_category: ''
            };

            const licenseData = await this.licenseRepository.getLicenseData(licenseId);
            licenseInfo.name = licenseData.details.name;
            licenseInfo.deps_using_license = depsUsingLicense;
            if (licenseData.details.description) {
                licenseInfo.description = licenseData.details.description;
            }
            if (licenseData.details.classification) {
                licenseInfo.license_category = licenseData.details.classification;
            }
            if (licenseData.details.licenseProperties) {
                licenseInfo.license_properties = licenseData.details.licenseProperties;
            }
            licenseInfo.references = licenseData.details.seeAlso;
            licenseMap[licenseId] = licenseInfo;
        }
        for (const [licenseId, depsUsingLicense] of Object.entries(
            licensesWorkspaceInfo.NonSpdxLicensesDepMap
        )) {
            licenseMap[licenseId] = {
                id: licenseId,
                license_compliance_violation:
                    licensesWorkspaceInfo.LicenseComplianceViolations.includes(licenseId),
                unable_to_infer: licenseId in licensesWorkspaceInfo.NonSpdxLicensesDepMap,
                name: '',
                description: '',
                deps_using_license: Array.from(new Set(depsUsingLicense)),
                license_category: ''
            };
        }

        const licenseInfoArray: LicenseInfo[] = Object.values(licenseMap);

        const [filtered, filterCount] = filter(licenseInfoArray, search_key, active_filters);
        const sorted = sort(filtered, sort_by, sort_direction);

        const paginated = paginate<LicenseInfo>(
            sorted,
            licenseInfoArray.length,
            { currentPage: page, entriesPerPage: entries_per_page },
            { maxEntriesPerPage: 100, defaultEntriesPerPage: 20 }
        );

        paginated.filter_count = filterCount;
        return paginated;
    }

    async getDependenciesUsingLicense(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string,
        license: string
    ): Promise<{ [key: string]: DepShortInfo }> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const licensesOutput: LicensesOutput = await getLicensesResult(
            analysisId,
            this.resultRepository
        );
        const sbomOutput: SbomOutput = await getSbomResult(analysisId, this.resultRepository);

        // Validate that the workspace exists
        if (!(workspace in licensesOutput.workspaces)) {
            throw new UnknownWorkspace();
        }

        const licensesWorkspaceInfo = licensesOutput.workspaces[workspace];

        const allDeps: Set<string> = new Set();

        if (license in licensesWorkspaceInfo.LicensesDepMap) {
            for (const dep of licensesWorkspaceInfo.LicensesDepMap[license]) {
                allDeps.add(dep);
            }
        }

        const depShortInfoMap: { [key: string]: DepShortInfo } = {};

        const safeAllDeps = [];
        for (const dep of allDeps) {
            const lastIndex = dep.lastIndexOf('@');
            const replaced = dep.slice(0, lastIndex) + ':' + dep.slice(lastIndex + 1);
            safeAllDeps.push(replaced);
        }

        const versionsInfo = await this.getDependencyVersions(safeAllDeps);
        for (const [key, versionInfo] of Object.entries(versionsInfo)) {
            const versionIndex = key.lastIndexOf(':');
            const depName = key.slice(0, versionIndex);
            const depVersion = key.slice(versionIndex + 1);
            const depKey = depName + '@' + depVersion;
            let packageManagerUrl = '';

            if (sbomOutput.analysis_info.package_manager == 'NPM') {
                packageManagerUrl = `https://www.npmjs.com/package/${depName}/v/${depVersion}`;
            } else if (sbomOutput.analysis_info.package_manager == 'YARN') {
                packageManagerUrl = `https://yarn.pm/${depName}`;
            }

            depShortInfoMap[depKey] = {
                name: depName,
                version: versionInfo.version,
                package_manager: sbomOutput.analysis_info.package_manager
            };

            if (packageManagerUrl.length > 0) {
                depShortInfoMap[depKey].package_manager_link = packageManagerUrl;
            }
        }

        return depShortInfoMap;
    }

    async getStatus(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<StatusResponse> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const licensesOutput = await getLicensesResult(analysisId, this.resultRepository);

        if (licensesOutput.analysis_info.private_errors.length) {
            return {
                public_errors: licensesOutput.analysis_info.public_errors,
                private_errors: licensesOutput.analysis_info.private_errors,
                stage_start: licensesOutput.analysis_info.analysis_start_time,
                stage_end: licensesOutput.analysis_info.analysis_end_time
            };
        }
        return {
            public_errors: [],
            private_errors: [],
            stage_start: licensesOutput.analysis_info.analysis_start_time,
            stage_end: licensesOutput.analysis_info.analysis_end_time
        };
    }

    private async getDependencyVersions(
        versionsArray: string[]
    ): Promise<{ [key: string]: Version }> {
        const safeVersionsArray: string[] = [];

        for (let version of versionsArray) {
            if (version.includes('/')) {
                version = version.replace('/', ':');
                safeVersionsArray.push(version);
            } else {
                safeVersionsArray.push(version);
            }
        }

        const versions: { [key: string]: Version } = {};

        throw new Error('Not implemented');
        // cursor = await db.query({
        //     query: `For version in VERSIONS FILTER version._key in @versionsArray RETURN version`,
        //     bindVars: { versionsArray: safeVersionsArray }
        // });

        // for await (const _version of cursor) {
        //     versions[_version._key] = _version;
        // }

        return versions;
    }
}
