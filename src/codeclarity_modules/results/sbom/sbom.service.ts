import { Injectable } from '@nestjs/common';
import { PaginatedResponse } from 'src/types/apiResponses.types';
import { AnalysisResultsService } from '../results.service';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    Dependency,
    DependencyDetails,
    Output as SBOMOutput,
    SbomDependency,
    WorkspacesOutput
} from 'src/codeclarity_modules/results/sbom/sbom.types';
import { paginate } from 'src/codeclarity_modules/results/utils/utils';
import { SbomUtilsService } from 'src/codeclarity_modules/results/sbom/utils/utils';
import { filter } from './utils/filter';
import { sort } from './utils/sort';
import { EntityNotFound, PluginResultNotAvailable, UnknownWorkspace } from 'src/types/error.types';
import { StatusResponse } from 'src/codeclarity_modules/results/status.types';
import { AnalysisStats, newAnalysisStats } from 'src/codeclarity_modules/results/sbom/sbom_stats.types';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/package/package.repository';
import { GraphDependency, GraphTraversalUtils } from './sbom_graph.types';

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
        private readonly packageRepository: PackageRepository,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
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
            relations: { analysis: { project: true } },
            where: {
                analysis: {
                    project: {
                        id: projectId
                    }
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

        wPrevStats.number_of_non_dev_dependencies =
            sbomPrevious.workspaces[workspace]?.start.dependencies?.length || 0;
        wPrevStats.number_of_dev_dependencies =
            sbomPrevious.workspaces[workspace]?.start.dev_dependencies?.length || 0;

        for (const dep of Object.values(dependencies)) {
            for (const version of Object.values(dep)) {
                if (version.Bundled) wStats.number_of_bundled_dependencies += 1;
                if (version.Optional) wStats.number_of_optional_dependencies += 1;
                if (version.Transitive && version.Direct)
                    wStats.number_of_both_direct_transitive_dependencies += 1;
                else if (version.Transitive) wStats.number_of_transitive_dependencies += 1;
                else if (version.Direct) wStats.number_of_direct_dependencies += 1;

                wStats.number_of_dependencies += 1;
            }
        }

        for (const dep of Object.values(dependenciesPrevious)) {
            for (const version of Object.values(dep)) {
                if (version.Bundled) wPrevStats.number_of_bundled_dependencies += 1;
                if (version.Optional) wPrevStats.number_of_optional_dependencies += 1;
                if (version.Transitive && version.Direct)
                    wPrevStats.number_of_both_direct_transitive_dependencies += 1;
                else if (version.Transitive) wPrevStats.number_of_transitive_dependencies += 1;
                else if (version.Direct) wPrevStats.number_of_direct_dependencies += 1;
                wPrevStats.number_of_dependencies += 1;
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
        search_key: string | undefined
    ): Promise<PaginatedResponse> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string != null)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        const sbom: SBOMOutput = await this.sbomUtilsService.getSbomResult(analysisId);

        const dependenciesArray: SbomDependency[] = [];

        for (const [dep_key, dep] of Object.entries(sbom.workspaces[workspace].dependencies)) {
            for (const [version_key, version] of Object.entries(dep)) {
                let is_direct = 0;

                if (sbom.workspaces[workspace].start.dependencies) {
                    for (const [, dependency] of Object.entries(
                        sbom.workspaces[workspace].start.dependencies
                    )) {
                        if (dependency.name == dep_key && dependency.version == version_key) {
                            is_direct = 1;
                            break;
                        }
                    }
                }
                if (sbom.workspaces[workspace].start.dev_dependencies && is_direct == 0) {
                    for (const [, dependency] of Object.entries(
                        sbom.workspaces[workspace].start.dev_dependencies
                    )) {
                        if (dependency.name == dep_key && dependency.version == version_key) {
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
                    dev: version.Dev,
                    prod: version.Prod,
                    is_direct_count: is_direct,
                    is_transitive_count: version.Transitive ? 1 : 0
                };

                const pack = await this.packageRepository.getPackageInfoWithoutFailing(dep_key);
                if (pack) sbomDependency.newest_release = pack.latest_version;

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

        const sbom: SBOMOutput = await this.sbomUtilsService.getSbomResult(analysisId);

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

        const sbom: SBOMOutput = await this.sbomUtilsService.getSbomResult(analysisId);

        return {
            workspaces: Object.keys(sbom.workspaces),
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

        const sbom: SBOMOutput = await this.sbomUtilsService.getSbomResult(analysisId);

        // Validate that the workspace exists
        if (!(workspace in sbom.workspaces)) {
            throw new UnknownWorkspace();
        }

        const [dependencyName, dependencyVersion] = dependency.split('@');

        if (dependencyName in sbom.workspaces[workspace].dependencies) {
            if (dependencyVersion in sbom.workspaces[workspace].dependencies[dependencyName]) {
                return await this.sbomUtilsService.getDependencyData(
                    analysisId,
                    workspace,
                    dependencyName,
                    dependencyVersion,
                    sbom
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
    ): Promise<Array<GraphDependency>> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const sbom: SBOMOutput = await this.sbomUtilsService.getSbomResult(analysisId);

        // Validate that the workspace exists
        if (!(workspace in sbom.workspaces)) {
            throw new UnknownWorkspace();
        }

        // Validate dependency parameter
        if (!dependency || dependency.trim() === '') {
            throw new EntityNotFound('Dependency parameter is required');
        }

        const dependenciesMap: { [depName: string]: { [version: string]: Dependency } } =
            sbom.workspaces[workspace].dependencies;

        // Check if dependencies exist in this workspace
        if (!dependenciesMap || Object.keys(dependenciesMap).length === 0) {
            throw new EntityNotFound('No dependencies found in this workspace');
        }

        // First, build the complete dependency graph
        const completeGraph: Array<GraphDependency> = this.buildCompleteGraph(dependenciesMap, sbom.workspaces[workspace]);

        console.log(`Complete graph has ${completeGraph.length} nodes`);
        console.log(`Looking for dependency: ${dependency}`);

        // Find the target dependency in the complete graph
        const targetNode = completeGraph.find(node => node.id === dependency);
        const virtualRoot = completeGraph.find(node => node.id === SBOMService.VIRTUAL_ROOT_ID);
        if (!targetNode) {
            console.log(`Available dependencies:`, completeGraph.map(n => n.id));
            throw new EntityNotFound(`Dependency ${dependency} not found in workspace ${workspace}`);
        }

        // If the target node is a direct dependency and does not already have the virtual root as a parent, add it
        if (virtualRoot && (!targetNode.parentIds || !targetNode.parentIds.includes(SBOMService.VIRTUAL_ROOT_ID))) {
            // Add virtual root as parent
            targetNode.parentIds = Array.from(new Set([...(targetNode.parentIds || []), SBOMService.VIRTUAL_ROOT_ID]));
            // Add target node as child of virtual root if not already present
            if (!virtualRoot.childrenIds) virtualRoot.childrenIds = [];
            if (!virtualRoot.childrenIds.includes(targetNode.id)) {
                virtualRoot.childrenIds.push(targetNode.id);
            }
            console.log(`Added virtual root as parent to direct dependency node: ${targetNode.id}`);
        }

        // Find only the paths that contain the target dependency
        // This excludes branches that don't lead to the target
        const pathNodes = GraphTraversalUtils.findMinimalPathsToTarget(dependency, completeGraph);

        // Ensure the target node is always included (even if it's a direct dependency/root)
        if (!pathNodes.some(node => node.id === dependency)) {
            const targetNodeInGraph = completeGraph.find(node => node.id === dependency);
            if (targetNodeInGraph) {
                pathNodes.push(targetNodeInGraph);
                console.log(`Explicitly added target node ${dependency} to pathNodes (was missing)`);
            }
        }

        console.log(`Found ${pathNodes.length} nodes in minimal paths to the target dependency`);

        // Always include the virtual root if any of the path nodes are its direct children
        if (virtualRoot && !pathNodes.some(node => node.id === virtualRoot.id)) {
            // Check if any path node is a child of virtual root
            const hasVirtualRootChild = pathNodes.some(node => 
                node.parentIds && node.parentIds.includes(SBOMService.VIRTUAL_ROOT_ID)
            );
            
            if (hasVirtualRootChild) {
                pathNodes.push(virtualRoot);
                console.log(`Added virtual root to the result`);
            }
        }

        console.log(`Final result has ${pathNodes.length} nodes`);
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
        dependenciesMap: { [depName: string]: { [version: string]: Dependency } },
        workspace: any
    ): Array<GraphDependency> {
        const graph: Array<GraphDependency> = [];
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

        console.log(`Built complete graph with ${graph.length} nodes`);
        console.log(`Virtual root has ${virtualRootNode.childrenIds?.length || 0} direct children`);
        console.log(`Sample nodes:`, graph.slice(0, 3).map(n => ({ 
            id: n.id, 
            parents: n.parentIds?.length || 0, 
            children: n.childrenIds?.length || 0 
        })));

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
        dependenciesMap: { [depName: string]: { [version: string]: Dependency } }
    ): string[] {
        if (!targetDependency || !targetDependency.includes('@')) {
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
                if (depData.Dependencies && 
                    typeof depData.Dependencies === 'object' && 
                    depData.Dependencies[targetName] === targetVersion) {
                    parents.push(`${depName}@${version}`);
                }
            }
        }

        return parents;
    }   
}
