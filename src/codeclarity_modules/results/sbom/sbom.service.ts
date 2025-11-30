import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/package/package.repository';
import {
    Dependency,
    DependencyDetails,
    Output as SBOMOutput,
    SbomDependency,
    WorkspacesOutput
} from 'src/codeclarity_modules/results/sbom/sbom.types';
import {
    AnalysisStats,
    newAnalysisStats
} from 'src/codeclarity_modules/results/sbom/sbom_stats.types';
import { SbomUtilsService } from 'src/codeclarity_modules/results/sbom/utils/utils';
import { StatusResponse } from 'src/codeclarity_modules/results/status.types';
import { paginate } from 'src/codeclarity_modules/results/utils/utils';
import { PaginatedResponse } from 'src/types/apiResponses.types';
import { EntityNotFound, UnknownWorkspace } from 'src/types/error.types';
import { AnalysisResultsService } from '../results.service';
import { GraphDependency, GraphTraversalUtils } from './sbom_graph.types';
import { filter } from './utils/filter';
import { sort } from './utils/sort';

@Injectable()
export class SBOMService {
    /**
     * Virtual root node ID used to create a unified tree structure.
     * All nodes without parents (root dependencies and orphaned nodes) will have this as their parent.
     * This node is included in API responses to provide a complete tree structure.
     */
    private static readonly VIRTUAL_ROOT_ID = '__VIRTUAL_ROOT__';

    constructor(
        private readonly analysisResultsService: AnalysisResultsService,
        private readonly sbomUtilsService: SbomUtilsService,
        private readonly packageRepository: PackageRepository
    ) {}

    async getStats(
        orgId: string,
        projectId: string,
        analysisId: string,
        workspace: string,
        user: AuthenticatedUser,
        ecosystem_filter?: string
    ): Promise<AnalysisStats> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        // Get merged SBOM results from all supported plugins
        const { mergedSbom } = await this.sbomUtilsService.getMergedSbomResults(analysisId);

        // Apply ecosystem filter if specified
        const sbom: SBOMOutput = ecosystem_filter
            ? this.sbomUtilsService.filterSbomByEcosystem(mergedSbom, ecosystem_filter)
            : mergedSbom;

        const workspacesOutput = sbom.workspaces[workspace]!;
        const dependencies = workspacesOutput.dependencies;

        // For previous stats comparison, we currently just use the same filtered data
        // TODO: Could be enhanced to get previous analysis data as well
        const sbomPrevious: SBOMOutput = sbom;
        const dependenciesPrevious = dependencies;

        const wPrevStats: AnalysisStats = newAnalysisStats();
        const wStats: AnalysisStats = newAnalysisStats();

        wStats.number_of_non_dev_dependencies =
            sbom.workspaces[workspace]?.start.dependencies?.length ?? 0;
        wStats.number_of_dev_dependencies =
            sbom.workspaces[workspace]?.start.dev_dependencies?.length ?? 0;

        wPrevStats.number_of_non_dev_dependencies =
            sbomPrevious.workspaces[workspace]?.start.dependencies?.length ?? 0;
        wPrevStats.number_of_dev_dependencies =
            sbomPrevious.workspaces[workspace]?.start.dev_dependencies?.length ?? 0;

        for (const [dep_key, dep] of Object.entries(dependencies)) {
            for (const [version_key, version] of Object.entries(dep)) {
                // Handle case sensitivity for different plugin formats
                const isDirect = version.Direct ?? (version as any).direct;
                const isTransitive = version.Transitive ?? (version as any).transitive;
                const isBundled = version.Bundled ?? (version as any).bundled;
                const isOptional = version.Optional ?? (version as any).optional;
                const isDev = version.Dev ?? (version as any).dev ?? false;
                const isProd = version.Prod ?? (version as any).prod ?? false;

                // Only count dependencies that are actually used (have dev or prod flags)
                if (isDev || isProd) {
                    if (isBundled) wStats.number_of_bundled_dependencies += 1;
                    if (isOptional) wStats.number_of_optional_dependencies += 1;
                    if (isTransitive && isDirect)
                        wStats.number_of_both_direct_transitive_dependencies += 1;
                    else if (isTransitive) wStats.number_of_transitive_dependencies += 1;
                    else if (isDirect) wStats.number_of_direct_dependencies += 1;

                    // Check if dependency is outdated by comparing with latest version
                    // Determine the language based on the ecosystem
                    const ecosystem = (version as any).ecosystem;
                    let language = 'javascript'; // default
                    if (ecosystem === 'packagist') {
                        language = 'php';
                    } else if (ecosystem === 'pypi') {
                        language = 'python';
                    }

                    const pack = await this.packageRepository.getPackageInfoWithoutFailing(
                        dep_key,
                        language
                    );
                    if (pack?.latest_version && pack.latest_version !== version_key) {
                        wStats.number_of_outdated_dependencies += 1;
                    }

                    // Check if dependency is deprecated
                    if (pack) {
                        try {
                            const versionInfo = await this.packageRepository.getVersionInfo(
                                dep_key,
                                version_key,
                                language
                            );
                            // After filtering in getVersionInfo, versions[0] is the specific version
                            const specificVersion = versionInfo.versions?.[0];
                            if (specificVersion?.extra?.['Deprecated']) {
                                wStats.number_of_deprecated_dependencies += 1;
                            }
                        } catch {
                            // Continue if we can't get version info
                        }
                    }

                    wStats.number_of_dependencies += 1;
                }
            }
        }

        for (const [dep_key, dep] of Object.entries(dependenciesPrevious)) {
            for (const [version_key, version] of Object.entries(dep)) {
                // Handle case sensitivity for different plugin formats
                const isDirect = version.Direct || (version as any).direct;
                const isTransitive = version.Transitive || (version as any).transitive;
                const isBundled = version.Bundled || (version as any).bundled;
                const isOptional = version.Optional || (version as any).optional;
                const isDev = version.Dev ?? (version as any).dev ?? false;
                const isProd = version.Prod ?? (version as any).prod ?? false;

                // Only count dependencies that are actually used (have dev or prod flags)
                if (isDev || isProd) {
                    if (isBundled) wPrevStats.number_of_bundled_dependencies += 1;
                    if (isOptional) wPrevStats.number_of_optional_dependencies += 1;
                    if (isTransitive && isDirect)
                        wPrevStats.number_of_both_direct_transitive_dependencies += 1;
                    else if (isTransitive) wPrevStats.number_of_transitive_dependencies += 1;
                    else if (isDirect) wPrevStats.number_of_direct_dependencies += 1;

                    // Check if dependency is outdated by comparing with latest version
                    // Determine the language based on the ecosystem
                    const ecosystem = (version as any).ecosystem;
                    let language = 'javascript'; // default
                    if (ecosystem === 'packagist') {
                        language = 'php';
                    } else if (ecosystem === 'pypi') {
                        language = 'python';
                    }

                    const pack = await this.packageRepository.getPackageInfoWithoutFailing(
                        dep_key,
                        language
                    );
                    if (pack?.latest_version && pack.latest_version !== version_key) {
                        wPrevStats.number_of_outdated_dependencies += 1;
                    }

                    // Check if dependency is deprecated
                    if (pack) {
                        try {
                            const versionInfo = await this.packageRepository.getVersionInfo(
                                dep_key,
                                version_key,
                                language
                            );
                            // After filtering in getVersionInfo, versions[0] is the specific version
                            const specificVersion = versionInfo.versions?.[0];
                            if (specificVersion?.extra?.['Deprecated']) {
                                wPrevStats.number_of_deprecated_dependencies += 1;
                            }
                        } catch {
                            // Continue if we can't get version info
                        }
                    }

                    wPrevStats.number_of_dependencies += 1;
                }
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
        search_key: string | undefined,
        ecosystem_filter?: string
    ): Promise<PaginatedResponse> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string !== null && active_filters_string !== undefined)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        // Get merged SBOM results from all supported plugins
        const { mergedSbom } = await this.sbomUtilsService.getMergedSbomResults(analysisId);

        // Apply ecosystem filter if specified
        const sbom: SBOMOutput = ecosystem_filter
            ? this.sbomUtilsService.filterSbomByEcosystem(mergedSbom, ecosystem_filter)
            : mergedSbom;

        const dependenciesArray: SbomDependency[] = [];

        for (const [dep_key, dep] of Object.entries(sbom.workspaces[workspace]!.dependencies)) {
            for (const [version_key, version] of Object.entries(dep)) {
                let is_direct = 0;

                if (sbom.workspaces[workspace]!.start.dependencies) {
                    for (const [, dependency] of Object.entries(
                        sbom.workspaces[workspace]!.start.dependencies
                    )) {
                        if (dependency.name === dep_key && dependency.version === version_key) {
                            is_direct = 1;
                            break;
                        }
                    }
                }
                if (sbom.workspaces[workspace]!.start.dev_dependencies && is_direct === 0) {
                    for (const [, dependency] of Object.entries(
                        sbom.workspaces[workspace]!.start.dev_dependencies
                    )) {
                        if (dependency.name === dep_key && dependency.version === version_key) {
                            is_direct = 1;
                            break;
                        }
                    }
                }

                const sbomDependency: SbomDependency = {
                    ...version,
                    name: dep_key,
                    version: version_key,
                    newest_release: version_key,
                    dev: version.Dev ?? (version as any).dev ?? false,
                    prod: version.Prod ?? (version as any).prod ?? false,
                    is_direct_count: is_direct,
                    is_transitive_count: version.Transitive || (version as any).transitive ? 1 : 0,
                    // Add ecosystem and source plugin information
                    ecosystem: (version as any).ecosystem,
                    source_plugin: (version as any).source_plugin
                };

                // Determine the language based on the ecosystem
                const ecosystem = (version as any).ecosystem;
                let language = 'javascript'; // default
                if (ecosystem === 'packagist') {
                    language = 'php';
                } else if (ecosystem === 'pypi') {
                    language = 'python';
                }

                const pack = await this.packageRepository.getPackageInfoWithoutFailing(
                    dep_key,
                    language
                );
                if (pack) {
                    sbomDependency.newest_release = pack.latest_version;

                    // Check for deprecation by loading version-specific info
                    try {
                        const versionInfo = await this.packageRepository.getVersionInfo(
                            dep_key,
                            version_key,
                            language
                        );

                        // After filtering in getVersionInfo, versions[0] is the specific version we want
                        const specificVersion = versionInfo.versions?.[0];
                        const deprecatedValue = specificVersion?.extra?.['Deprecated'];

                        if (deprecatedValue) {
                            sbomDependency.deprecated = true;
                            sbomDependency.deprecated_message =
                                typeof deprecatedValue === 'string'
                                    ? deprecatedValue
                                    : 'This package is deprecated';
                        } else {
                            sbomDependency.deprecated = false;
                        }
                    } catch {
                        // Version info not available in knowledge database
                        sbomDependency.deprecated = false;
                    }
                } else {
                    sbomDependency.deprecated = false;
                }

                // If the dependency is not tagged as prod or dev,
                // then it is not used in the workspace.
                // It can be used in another workspace
                if (sbomDependency.dev || sbomDependency.prod) {
                    dependenciesArray.push(sbomDependency);
                }
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

        // Get merged SBOM results from all supported plugins
        const { mergedSbom } = await this.sbomUtilsService.getMergedSbomResults(analysisId);

        if (mergedSbom.analysis_info.private_errors.length) {
            return {
                public_errors: mergedSbom.analysis_info.public_errors,
                private_errors: mergedSbom.analysis_info.private_errors,
                stage_start: mergedSbom.analysis_info.analysis_start_time,
                stage_end: mergedSbom.analysis_info.analysis_end_time
            };
        }
        return {
            public_errors: [],
            private_errors: [],
            stage_start: mergedSbom.analysis_info.analysis_start_time,
            stage_end: mergedSbom.analysis_info.analysis_end_time
        };
    }

    async getWorkspaces(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<WorkspacesOutput> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        // Get merged SBOM results from all supported plugins
        const { mergedSbom } = await this.sbomUtilsService.getMergedSbomResults(analysisId);

        return {
            workspaces: Object.keys(mergedSbom.workspaces),
            package_manager: mergedSbom.analysis_info.package_manager
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

        // Get merged SBOM results from all supported plugins
        const { mergedSbom } = await this.sbomUtilsService.getMergedSbomResults(analysisId);

        // Validate that the workspace exists
        if (!(workspace in mergedSbom.workspaces)) {
            throw new UnknownWorkspace();
        }

        const [dependencyName, dependencyVersion] = dependency.split('@');

        if (dependencyName && dependencyName in mergedSbom.workspaces[workspace]!.dependencies) {
            if (
                dependencyVersion &&
                dependencyVersion in mergedSbom.workspaces[workspace]!.dependencies[dependencyName]!
            ) {
                return await this.sbomUtilsService.getDependencyData(
                    analysisId,
                    workspace,
                    dependencyName,
                    dependencyVersion,
                    mergedSbom
                );
            }
        }

        throw new EntityNotFound();
    }

    async getDependencyGraph(
        orgId: string,
        projectId: string,
        analysisId: string,
        workspace: string,
        dependency: string,
        user: AuthenticatedUser
    ): Promise<GraphDependency[]> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        // Get merged SBOM results from all supported plugins
        const { mergedSbom } = await this.sbomUtilsService.getMergedSbomResults(analysisId);

        // Validate that the workspace exists
        if (!(workspace in mergedSbom.workspaces)) {
            throw new UnknownWorkspace();
        }

        // Validate dependency parameter
        if (!dependency || dependency.trim() === '') {
            throw new EntityNotFound('Dependency parameter is required');
        }

        const dependenciesMap: Record<string, Record<string, Dependency>> = mergedSbom.workspaces[
            workspace
        ]!.dependencies;

        // Check if dependencies exist in this workspace
        if (!dependenciesMap || Object.keys(dependenciesMap).length === 0) {
            throw new EntityNotFound('No dependencies found in this workspace');
        }

        // First, build the complete dependency graph
        const completeGraph: GraphDependency[] = this.buildCompleteGraph(
            dependenciesMap,
            mergedSbom.workspaces[workspace]
        );

        // Find the target dependency in the complete graph
        const targetNode = completeGraph.find((node) => node.id === dependency);
        const virtualRoot = completeGraph.find((node) => node.id === SBOMService.VIRTUAL_ROOT_ID);
        if (!targetNode) {
            throw new EntityNotFound(
                `Dependency ${dependency} not found in workspace ${workspace}`
            );
        }

        // If the target node is a direct dependency and does not already have the virtual root as a parent, add it
        if (virtualRoot && !targetNode.parentIds?.includes(SBOMService.VIRTUAL_ROOT_ID)) {
            // Add virtual root as parent
            targetNode.parentIds = Array.from(
                new Set([...(targetNode.parentIds ?? []), SBOMService.VIRTUAL_ROOT_ID])
            );
            // Add target node as child of virtual root if not already present
            virtualRoot.childrenIds ??= [];
            if (!virtualRoot.childrenIds.includes(targetNode.id)) {
                virtualRoot.childrenIds.push(targetNode.id);
            }
        }

        // Find only the paths that contain the target dependency
        // This excludes branches that don't lead to the target
        const pathNodes = GraphTraversalUtils.findMinimalPathsToTarget(dependency, completeGraph);

        // Ensure the target node is always included (even if it's a direct dependency/root)
        if (!pathNodes.some((node) => node.id === dependency)) {
            const targetNodeInGraph = completeGraph.find((node) => node.id === dependency);
            if (targetNodeInGraph) {
                pathNodes.push(targetNodeInGraph);
            }
        }

        // Always include the virtual root if any of the path nodes are its direct children
        if (virtualRoot && !pathNodes.some((node) => node.id === virtualRoot.id)) {
            // Check if any path node is a child of virtual root
            const hasVirtualRootChild = pathNodes.some((node) =>
                node.parentIds?.includes(SBOMService.VIRTUAL_ROOT_ID)
            );

            if (hasVirtualRootChild) {
                pathNodes.push(virtualRoot);
            }
        }

        return pathNodes;
    }

    /**
     * Builds a complete dependency graph from the SBOM data with a unified tree structure.
     * Creates a virtual root node that serves as the parent for all orphaned nodes,
     * ensuring every node in the graph has a path to the root.
     *
     * @param dependenciesMap - Map of dependencies from SBOM
     * @param workspace - Workspace data containing start dependencies
     * @returns Complete graph of all dependencies with parent-child relationships rooted at virtual root
     */
    private buildCompleteGraph(
        dependenciesMap: Record<string, Record<string, Dependency>>,
        workspace: any
    ): GraphDependency[] {
        const graph: GraphDependency[] = [];
        const processedNodes = new Set<string>();

        // Create a virtual root node that will be the parent of all orphaned nodes
        const virtualRootId = SBOMService.VIRTUAL_ROOT_ID;
        const virtualRootNode: GraphDependency = {
            id: virtualRootId,
            parentIds: [],
            childrenIds: [],
            prod: false, // Virtual root is not a production dependency
            dev: false // Virtual root is not a dev dependency
        };

        // Add root dependencies (those without parents)
        const rootDependencies = new Set<string>();

        // Collect start dependencies (these are roots)
        if (workspace.start?.dependencies) {
            for (const dep of workspace.start.dependencies) {
                if (dep.name && dep.version) {
                    rootDependencies.add(`${dep.name}@${dep.version}`);
                }
            }
        }
        if (workspace.start?.dev_dependencies) {
            for (const dep of workspace.start.dev_dependencies) {
                if (dep.name && dep.version) {
                    rootDependencies.add(`${dep.name}@${dep.version}`);
                }
            }
        }

        // Process all dependencies and build parent-child relationships
        for (const [depName, versions] of Object.entries(dependenciesMap)) {
            if (!depName || !versions) continue;

            for (const [version, depData] of Object.entries(versions)) {
                if (!version || !depData) continue;

                const nodeId = `${depName}@${version}`;
                if (processedNodes.has(nodeId)) {
                    continue;
                }

                // Determine if this is a root node
                const isRoot = rootDependencies.has(nodeId);

                // Default node
                const node: GraphDependency = {
                    id: nodeId,
                    parentIds: [],
                    childrenIds: [],
                    prod: !!depData.Prod, // True if this is a production dependency
                    dev: !!depData.Dev // True if this is a dev dependency
                };

                // Add children from Dependencies property
                if (depData.Dependencies && typeof depData.Dependencies === 'object') {
                    for (const [childName, childVersion] of Object.entries(depData.Dependencies)) {
                        if (childName && childVersion) {
                            const childId = `${childName}@${childVersion}`;
                            node.childrenIds!.push(childId);
                        }
                    }
                }

                // Find all parents for this node
                const parents = this.findParentDependencies(nodeId, dependenciesMap);

                if (parents.length > 0) {
                    // Node has real parents
                    node.parentIds = parents;
                } else if (isRoot) {
                    // Root node (from package.json) - make it a child of virtual root
                    node.parentIds = [virtualRootId];
                    virtualRootNode.childrenIds!.push(nodeId);
                    // Add prod/dev info for direct children of root
                    node.prod = !!depData.Prod;
                    node.dev = !!depData.Dev;
                } else {
                    // Orphaned node (no parents found) - make it a child of virtual root
                    node.parentIds = [virtualRootId];
                    virtualRootNode.childrenIds!.push(nodeId);
                }

                graph.push(node);
                processedNodes.add(nodeId);
            }
        }

        // Add the virtual root node to the graph
        graph.push(virtualRootNode);

        return graph;
    }

    /**
     * Finds all parent dependencies for a given dependency
     * @param targetDependency - The dependency to find parents for (format: "name@version")
     * @param dependenciesMap - Map of all dependencies
     * @returns Array of parent dependency IDs
     */
    private findParentDependencies(
        targetDependency: string,
        dependenciesMap: Record<string, Record<string, Dependency>>
    ): string[] {
        if (!targetDependency?.includes('@')) {
            return [];
        }

        const [targetName, targetVersion] = targetDependency.split('@');
        if (!targetName || !targetVersion) {
            return [];
        }

        const parents: string[] = [];

        // Look through all dependencies to see which ones have this as a child
        for (const [depName, versions] of Object.entries(dependenciesMap)) {
            if (!depName || !versions) continue;

            for (const [version, depData] of Object.entries(versions)) {
                if (!version || !depData) continue;

                // Check if this dependency has the target as a child in Dependencies
                if (
                    depData.Dependencies &&
                    typeof depData.Dependencies === 'object' &&
                    depData.Dependencies[targetName] === targetVersion
                ) {
                    parents.push(`${depName}@${version}`);
                }
            }
        }

        return parents;
    }
}
