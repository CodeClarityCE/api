import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/license/license.repository';
import { Version } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { Output as LicensesOutput } from 'src/codeclarity_modules/results/licenses/licenses.types';
import {
    LicenseInfo,
    DepShortInfo
} from 'src/codeclarity_modules/results/licenses/licenses2.types';
import { filter } from 'src/codeclarity_modules/results/licenses/utils/filter';
import { sort } from 'src/codeclarity_modules/results/licenses/utils/sort';
import { Output as SbomOutput } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { StatusResponse } from 'src/codeclarity_modules/results/status.types';
import { paginate } from 'src/codeclarity_modules/results/utils/utils';
import { PaginatedResponse } from 'src/types/apiResponses.types';
import { UnknownWorkspace } from 'src/types/error.types';


import { AnalysisResultsService } from '../results.service';
import { SbomUtilsService } from '../sbom/utils/utils';

import { LicensesUtilsService } from './utils/utils';


@Injectable()
export class LicensesService {
    constructor(
        private readonly analysisResultsService: AnalysisResultsService,
        private readonly licenseRepository: LicenseRepository,
        private readonly licensesUtilsService: LicensesUtilsService,
        private readonly sbomUtilsService: SbomUtilsService,
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
        search_key: string | undefined,
        ecosystem_filter?: string
    ): Promise<PaginatedResponse> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string !== null && active_filters_string !== undefined)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        let licensesOutput: LicensesOutput =
            await this.licensesUtilsService.getLicensesResult(analysisId);

        // Validate that the workspace exists
        if (!(workspace in licensesOutput.workspaces)) {
            throw new Error(`Workspace "${workspace}" not found`);
        }

        // Apply ecosystem filter if specified
        if (ecosystem_filter) {
            licensesOutput = this.licensesUtilsService.filterLicensesByEcosystem(
                licensesOutput,
                ecosystem_filter,
                workspace
            );
        }

        const licensesWorkspaceInfo = licensesOutput.workspaces[workspace]!;
        const licenseMap: Record<string, LicenseInfo> = {};

        // Ensure LicensesDepMap exists and is an object
        if (
            !licensesWorkspaceInfo.LicensesDepMap ||
            typeof licensesWorkspaceInfo.LicensesDepMap !== 'object'
        ) {
            licensesWorkspaceInfo.LicensesDepMap = {};
        }

        for (const [licenseId, depsUsingLicense] of Object.entries(
            licensesWorkspaceInfo.LicensesDepMap
        )) {
            const licenseInfo: LicenseInfo = {
                id: licenseId,
                license_compliance_violation:
                    licensesWorkspaceInfo.LicenseComplianceViolations?.includes(licenseId) ?? false,
                unable_to_infer: licenseId in (licensesWorkspaceInfo.NonSpdxLicensesDepMap ?? {}),
                name: '',
                description: '',
                deps_using_license: Array.from(new Set(depsUsingLicense)),
                license_category: ''
            };

            try {
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
            } catch (error) {
                console.error(`Failed to get license data for license ID: ${licenseId}`, error);
                // Set default values when license data is not found
                licenseInfo.name = licenseId; // Use the license ID as fallback name
                licenseInfo.description = 'License information not available';
                licenseInfo.license_category = 'Unknown';
            }
            licenseMap[licenseId] = licenseInfo;
        }
        // Ensure NonSpdxLicensesDepMap exists before iterating
        if (
            licensesWorkspaceInfo.NonSpdxLicensesDepMap &&
            typeof licensesWorkspaceInfo.NonSpdxLicensesDepMap === 'object'
        ) {
            for (const [licenseId, depsUsingLicense] of Object.entries(
                licensesWorkspaceInfo.NonSpdxLicensesDepMap
            )) {
                licenseMap[licenseId] = {
                    id: licenseId,
                    license_compliance_violation:
                        licensesWorkspaceInfo.LicenseComplianceViolations?.includes(licenseId) ??
                        false,
                    unable_to_infer:
                        licenseId in (licensesWorkspaceInfo.NonSpdxLicensesDepMap ?? {}),
                    name: '',
                    description: '',
                    deps_using_license: Array.from(new Set(depsUsingLicense)),
                    license_category: ''
                };
            }
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
    ): Promise<Record<string, DepShortInfo>> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const licensesOutput: LicensesOutput =
            await this.licensesUtilsService.getLicensesResult(analysisId);
        const sbomOutput: SbomOutput = await this.sbomUtilsService.getSbomResult(analysisId);

        // Validate that the workspace exists
        if (!(workspace in licensesOutput.workspaces)) {
            throw new UnknownWorkspace();
        }

        const licensesWorkspaceInfo = licensesOutput.workspaces[workspace]!;

        const allDeps = new Set<string>();

        if (license in licensesWorkspaceInfo.LicensesDepMap) {
            for (const dep of licensesWorkspaceInfo.LicensesDepMap[license]!) {
                allDeps.add(dep);
            }
        }

        const depShortInfoMap: Record<string, DepShortInfo> = {};

        const safeAllDeps = [];
        for (const dep of allDeps) {
            const lastIndex = dep.lastIndexOf('@');
            const replaced = `${dep.slice(0, lastIndex)  }:${  dep.slice(lastIndex + 1)}`;
            safeAllDeps.push(replaced);
        }

        const versionsInfo = await this.getDependencyVersions(safeAllDeps);
        for (const [key, versionInfo] of Object.entries(versionsInfo)) {
            const versionIndex = key.lastIndexOf(':');
            const depName = key.slice(0, versionIndex);
            const depVersion = key.slice(versionIndex + 1);
            const depKey = `${depName  }@${  depVersion}`;
            let packageManagerUrl = '';

            if (sbomOutput.analysis_info.package_manager === 'NPM') {
                packageManagerUrl = `https://www.npmjs.com/package/${depName}/v/${depVersion}`;
            } else if (sbomOutput.analysis_info.package_manager === 'YARN') {
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

        const licensesOutput = await this.licensesUtilsService.getLicensesResult(analysisId);

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
    ): Promise<Record<string, Version>> {
        const safeVersionsArray: string[] = [];

        for (let version of versionsArray) {
            if (version.includes('/')) {
                version = version.replace('/', ':');
                safeVersionsArray.push(version);
            } else {
                safeVersionsArray.push(version);
            }
        }

        const versions: Record<string, Version> = {};

        // TODO: Implement dependency version lookup from package database
        // For now, return empty versions to avoid 500 errors
        // This means dependency details won't show version info, but licenses will work
        console.warn('getDependencyVersions not implemented - returning empty versions');

        // Create minimal version objects for each requested package
        for (const version of safeVersionsArray) {
            const versionParts = version.split(':');
            const versionNumber =
                versionParts.length > 1 ? versionParts[versionParts.length - 1] : 'unknown';

            versions[version] = {
                id: '', // Empty ID since we're not looking up from database
                version: versionNumber,
                dependencies: {},
                dev_dependencies: {},
                extra: {},
                package_id: ''
            } as unknown as Version;
        }

        return versions;
    }
}
