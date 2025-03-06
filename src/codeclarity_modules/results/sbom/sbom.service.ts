import { Injectable } from '@nestjs/common';
import { PaginatedResponse } from 'src/types/apiResponses';
import { AnalysisResultsService } from '../results.service';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    DependencyDetails,
    Output as SBOMOutput,
    SbomDependency,
    WorkspacesOutput
} from 'src/codeclarity_modules/results/sbom/sbom.types';
import { paginate } from 'src/codeclarity_modules/results/utils/utils';
import { getDependencyData, getSbomResult } from 'src/codeclarity_modules/results/sbom/utils/utils';
import { filter } from './utils/filter';
import { sort } from './utils/sort';
import { EntityNotFound, PluginResultNotAvailable, UnknownWorkspace } from 'src/types/errors/types';
import { StatusResponse } from 'src/codeclarity_modules/results/status.types';
import { AnalysisStats, newAnalysisStats } from 'src/codeclarity_modules/results/sbom/sbom2.types';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Package } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class SBOMService {
    constructor(
        private readonly analysisResultsService: AnalysisResultsService,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>,
        @InjectRepository(Package, 'knowledge')
        private packageRepository: Repository<Package>
    ) {}

    async getStats(
        orgId: string,
        projectId: string,
        analysisId: string,
        workspace: string,
        user: AuthenticatedUser
    ): Promise<AnalysisStats> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const result = await this.resultRepository.find({
            relations: { analysis: true },
            where: {
                analysis: {
                    id: analysisId
                },
                plugin: 'js-sbom'
            },
            order: {
                analysis: {
                    created_on: 'DESC'
                }
            },
            take: 2,
            cache: true
        });
        if (result.length == 0) {
            throw new PluginResultNotAvailable();
        }

        const sbom: SBOMOutput = result[0].result as unknown as SBOMOutput;
        const workspacesOutput = sbom.workspaces[workspace];
        const dependencies = workspacesOutput.dependencies;

        let sbomPrevious: SBOMOutput = sbom;
        let dependenciesPrevious = dependencies;

        if (result.length > 1) {
            sbomPrevious = result[1].result as unknown as SBOMOutput;
            const workspacesOutput = sbomPrevious.workspaces[workspace];
            dependenciesPrevious = workspacesOutput.dependencies;
        }

        const wPrevStats: AnalysisStats = newAnalysisStats();
        const wStats: AnalysisStats = newAnalysisStats();

        wStats.number_of_non_dev_dependencies =
            sbom.workspaces[workspace]?.start.dependencies?.length || 0;
        wStats.number_of_dev_dependencies =
            sbom.workspaces[workspace]?.start.dev_dependencies?.length || 0;
        for (const dep of Object.values(dependencies)) {
            for (const version of Object.values(dep)) {
                // TODO check if correct
                if (version.Bundled) wStats.number_of_bundled_dependencies += 1;
                // if (version.peer) wStats.number_of_peer_dependencies += 1;
                if (version.Optional) wStats.number_of_optional_dependencies += 1;
                wStats.number_of_direct_dependencies += 1;
            }
        }

        for (const dep of Object.values(dependenciesPrevious)) {
            for (const version of Object.values(dep)) {
                if (version.Bundled) wPrevStats.number_of_bundled_dependencies += 1;
                // if (version.peer) wPrevStats.number_of_peer_dependencies += 1;
                if (version.Optional) wPrevStats.number_of_optional_dependencies += 1;
                wPrevStats.number_of_direct_dependencies += 1;
            }
        }

        wStats.number_of_dev_dependencies_diff =
            wStats.number_of_dev_dependencies - wPrevStats.number_of_dev_dependencies;
        wStats.number_of_non_dev_dependencies_diff =
            wStats.number_of_non_dev_dependencies - wPrevStats.number_of_non_dev_dependencies;
        wStats.number_of_bundled_dependencies_diff =
            wStats.number_of_non_dev_dependencies - wPrevStats.number_of_non_dev_dependencies;
        wStats.number_of_optional_dependencies_diff =
            wStats.number_of_optional_dependencies - wPrevStats.number_of_optional_dependencies;
        wStats.number_of_peer_dependencies_diff =
            wStats.number_of_peer_dependencies - wPrevStats.number_of_peer_dependencies;
        wStats.number_of_direct_dependencies_diff =
            wStats.number_of_direct_dependencies - wPrevStats.number_of_direct_dependencies;
        wStats.number_of_transitive_dependencies_diff =
            wStats.number_of_transitive_dependencies - wPrevStats.number_of_transitive_dependencies;
        wStats.number_of_deprecated_dependencies_diff =
            wStats.number_of_deprecated_dependencies - wPrevStats.number_of_deprecated_dependencies;
        wStats.number_of_unlicensed_dependencies_diff =
            wStats.number_of_unlicensed_dependencies - wPrevStats.number_of_unlicensed_dependencies;
        wStats.number_of_outdated_dependencies_diff =
            wStats.number_of_outdated_dependencies - wPrevStats.number_of_outdated_dependencies;
        wStats.number_of_dependencies_diff =
            wStats.number_of_dependencies - wPrevStats.number_of_dependencies;
        wStats.average_dependency_age_diff =
            wStats.average_dependency_age - wPrevStats.average_dependency_age;

        return wStats;
    }

    // async getGraph(
    //     orgId: string,
    //     projectId: string,
    //     analysisId: string,
    //     workspace: string,
    //     user: AuthenticatedUser
    // ): Promise<GraphOutput> {
    //     await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

    //     const sbom: SBOMOutput = await getSbomResult(analysisId);

    //     // Validate that the workspace exists
    //     if (!(workspace in sbom.workspaces)) {
    //         throw new UnknownWorkspace();
    //     }

    //     const dependenciesMap: { [key: string]: Dependency } =
    //         sbom.workspaces[workspace].dependencies;

    //     sbom.workspaces[workspace].dependencies = dependenciesMap;

    //     let relativePackageFile: string =
    //         sbom.analysis_info.work_space_package_file_paths[workspace];
    //     const baseFile: string =
    //         relativePackageFile.split('/')[relativePackageFile.split('/').length - 1];
    //     const baseDir: string =
    //         relativePackageFile.split('/')[relativePackageFile.split('/').length - 2];
    //     const cleanedBaseDir = baseDir.replace(
    //         '-' + baseDir.split('-')[baseDir.split('-').length - 1],
    //         ''
    //     );
    //     relativePackageFile = `${cleanedBaseDir}/${baseFile}`;

    //     return {
    //         graph: sbom.workspaces[workspace],
    //         project_name: relativePackageFile
    //     };
    // }

    async getSbom(
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
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string != null)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        const sbom: SBOMOutput = await getSbomResult(analysisId, this.resultRepository);

        const dependenciesArray: SbomDependency[] = [];

        for (const [dep_key, dep] of Object.entries(sbom.workspaces[workspace].dependencies)) {
            for (const [version_key, version] of Object.entries(dep)) {
                const sbomDependency: SbomDependency = {
                    ...version,
                    name: dep_key,
                    version: version_key,
                    newest_release: version_key
                };

                const pack = await this.packageRepository.findOne({
                    where: {
                        name: dep_key
                    }
                });
                if (pack) {
                    sbomDependency.newest_release = pack.latest_version;
                }

                dependenciesArray.push(sbomDependency);
            }
        }

        // Filter, sort and paginate the dependnecies list
        const [filtered, filterCount] = filter(dependenciesArray, search_key, active_filters);
        const sorted = sort(filtered, sort_by, sort_direction);

        const paginated = paginate<SbomDependency>(
            sorted,
            dependenciesArray.length,
            { currentPage: page, entriesPerPage: entries_per_page },
            { maxEntriesPerPage: 100, defaultEntriesPerPage: 20 }
        );

        paginated.filter_count = filterCount;

        return paginated;
    }

    async getStatus(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<StatusResponse> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const sbom: SBOMOutput = await getSbomResult(analysisId, this.resultRepository);

        if (sbom.analysis_info.private_errors.length) {
            return {
                public_errors: sbom.analysis_info.public_errors,
                private_errors: sbom.analysis_info.private_errors,
                stage_start: sbom.analysis_info.analysis_start_time,
                stage_end: sbom.analysis_info.analysis_end_time
            };
        }
        return {
            public_errors: [],
            private_errors: [],
            stage_start: sbom.analysis_info.analysis_start_time,
            stage_end: sbom.analysis_info.analysis_end_time
        };
    }

    async getWorkspaces(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<WorkspacesOutput> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const sbom: SBOMOutput = await getSbomResult(analysisId, this.resultRepository);

        const map = sbom.analysis_info.work_space_package_file_paths;

        const cleanedMap: { [key: string]: string } = {};

        for (let index = 0; index < Object.entries(map).length; index++) {
            const element = Object.entries(map)[index];
            const key = element[0];
            let path = element[1];
            const baseFile: string = path.split('/')[path.split('/').length - 1];
            const baseDir: string = path.split('/')[path.split('/').length - 2];
            const cleanedBaseDir = baseDir.replace(
                '-' + baseDir.split('-')[baseDir.split('-').length - 1],
                ''
            );
            path = `${cleanedBaseDir}/${baseFile}`;
            cleanedMap[key] = path;
        }

        return {
            workspaces_map: cleanedMap,
            package_manager: sbom.analysis_info.package_manager
        };
    }

    async getDependency(
        orgId: string,
        projectId: string,
        analysisId: string,
        workspace: string,
        dependency: string,
        user: AuthenticatedUser
    ): Promise<DependencyDetails> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const sbom: SBOMOutput = await getSbomResult(analysisId, this.resultRepository);

        // Validate that the workspace exists
        if (!(workspace in sbom.workspaces)) {
            throw new UnknownWorkspace();
        }

        const [dependencyName, dependencyVersion] = dependency.split('@');

        if (dependencyName in sbom.workspaces[workspace].dependencies) {
            if (dependencyVersion in sbom.workspaces[workspace].dependencies[dependencyName]) {
                return await getDependencyData(
                    analysisId,
                    workspace,
                    dependencyName,
                    dependencyVersion,
                    sbom,
                    this.packageRepository
                );
            }
        }

        throw new EntityNotFound();
    }

    // async getDependencyGraph(
    //     orgId: string,
    //     projectId: string,
    //     analysisId: string,
    //     workspace: string,
    //     dependency: string,
    //     user: AuthenticatedUser
    // ): Promise<GraphOutput> {
    //     await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

    //     const sbom: SBOMOutput = await getSbomResult(analysisId);

    //     // Validate that the workspace exists
    //     if (!(workspace in sbom.workspaces)) {
    //         throw new UnknownWorkspace();
    //     }

    //     const dependenciesMap: { [key: string]: Dependency } =
    //         sbom.workspaces[workspace].dependencies;
    //     const parentGraph: WorkSpaceData = await getParents(dependenciesMap, dependency, new Set());

    //     let relativePackageFile: string =
    //         sbom.analysis_info.work_space_package_file_paths[workspace];
    //     const baseFile: string =
    //         relativePackageFile.split('/')[relativePackageFile.split('/').length - 1];
    //     const baseDir: string =
    //         relativePackageFile.split('/')[relativePackageFile.split('/').length - 2];
    //     const cleanedBaseDir = baseDir.replace(
    //         '-' + baseDir.split('-')[baseDir.split('-').length - 1],
    //         ''
    //     );
    //     relativePackageFile = `${cleanedBaseDir}/${baseFile}`;

    //     return {
    //         graph: parentGraph,
    //         project_name: relativePackageFile
    //     };
    // }
}
