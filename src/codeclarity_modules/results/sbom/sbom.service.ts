import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { PackageRepository } from "src/codeclarity_modules/knowledge/package/package.repository";
import {
  Dependency,
  DependencyDetails,
  Output as SBOMOutput,
  SbomDependency,
  WorkSpaceData,
  WorkSpaceDependency,
  WorkspacesOutput,
} from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  AnalysisStats,
  newAnalysisStats,
} from "src/codeclarity_modules/results/sbom/sbom_stats.types";
import { SbomUtilsService } from "src/codeclarity_modules/results/sbom/utils/utils";
import { StatusResponse } from "src/codeclarity_modules/results/status.types";
import { paginate } from "src/codeclarity_modules/results/utils/utils";
import { PaginatedResponse } from "src/types/apiResponses.types";
import { EntityNotFound, UnknownWorkspace } from "src/types/error.types";

import { AnalysisResultsService } from "../results.service";

import { GraphDependency, GraphTraversalUtils } from "./sbom_graph.types";
import { filter } from "./utils/filter";
import { sort } from "./utils/sort";

/** Query options for SBOM list endpoint */
export interface SbomQueryOptions {
  workspace: string;
  page?: number | undefined;
  entriesPerPage?: number | undefined;
  sortBy?: string | undefined;
  sortDirection?: string | undefined;
  activeFilters?: string | undefined;
  searchKey?: string | undefined;
  ecosystemFilter?: string | undefined;
}

/**
 * Extended dependency with multi-language support fields.
 * Different plugins (js-sbom, php-sbom) may use different casing.
 */
interface EnhancedDependency extends Dependency {
  direct?: boolean;
  transitive?: boolean;
  bundled?: boolean;
  optional?: boolean;
  dev?: boolean;
  prod?: boolean;
  ecosystem?: string;
  source_plugin?: string;
}

/** Get language identifier from ecosystem */
function getLanguageFromEcosystem(ecosystem: string | undefined): string {
  if (ecosystem === "packagist") return "php";
  if (ecosystem === "pypi") return "python";
  return "javascript";
}

@Injectable()
export class SBOMService {
  /**
   * Virtual root node ID used to create a unified tree structure.
   * All nodes without parents (root dependencies and orphaned nodes) will have this as their parent.
   * This node is included in API responses to provide a complete tree structure.
   */
  private static readonly VIRTUAL_ROOT_ID = "__VIRTUAL_ROOT__";

  constructor(
    private readonly analysisResultsService: AnalysisResultsService,
    private readonly sbomUtilsService: SbomUtilsService,
    private readonly packageRepository: PackageRepository,
  ) {}

  async getStats(
    orgId: string,
    projectId: string,
    analysisId: string,
    workspace: string,
    user: AuthenticatedUser,
    ecosystem_filter?: string,
  ): Promise<AnalysisStats> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    // Get merged SBOM results from all supported plugins
    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);

    // Apply ecosystem filter if specified
    const sbom: SBOMOutput = ecosystem_filter
      ? this.sbomUtilsService.filterSbomByEcosystem(
          mergedSbom,
          ecosystem_filter,
        )
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

    await this.processDependencyStats(dependencies, wStats);
    await this.processDependencyStats(dependenciesPrevious, wPrevStats);

    wStats.number_of_dev_dependencies_diff =
      wStats.number_of_dev_dependencies - wPrevStats.number_of_dev_dependencies;
    wStats.number_of_non_dev_dependencies_diff =
      wStats.number_of_non_dev_dependencies -
      wPrevStats.number_of_non_dev_dependencies;
    wStats.number_of_bundled_dependencies_diff =
      wStats.number_of_non_dev_dependencies -
      wPrevStats.number_of_non_dev_dependencies;
    wStats.number_of_optional_dependencies_diff =
      wStats.number_of_optional_dependencies -
      wPrevStats.number_of_optional_dependencies;
    wStats.number_of_peer_dependencies_diff =
      wStats.number_of_peer_dependencies -
      wPrevStats.number_of_peer_dependencies;
    wStats.number_of_direct_dependencies_diff =
      wStats.number_of_direct_dependencies -
      wPrevStats.number_of_direct_dependencies;
    wStats.number_of_transitive_dependencies_diff =
      wStats.number_of_transitive_dependencies -
      wPrevStats.number_of_transitive_dependencies;
    wStats.number_of_deprecated_dependencies_diff =
      wStats.number_of_deprecated_dependencies -
      wPrevStats.number_of_deprecated_dependencies;
    wStats.number_of_unlicensed_dependencies_diff =
      wStats.number_of_unlicensed_dependencies -
      wPrevStats.number_of_unlicensed_dependencies;
    wStats.number_of_outdated_dependencies_diff =
      wStats.number_of_outdated_dependencies -
      wPrevStats.number_of_outdated_dependencies;
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
    options: SbomQueryOptions,
  ): Promise<PaginatedResponse> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const {
      workspace,
      page,
      entriesPerPage: entries_per_page,
      sortBy: sort_by,
      sortDirection: sort_direction,
      activeFilters: active_filters_string,
      searchKey: search_key,
      ecosystemFilter: ecosystem_filter,
    } = options;

    let active_filters: string[] = [];
    if (active_filters_string !== null && active_filters_string !== undefined)
      active_filters = active_filters_string
        .replace("[", "")
        .replace("]", "")
        .split(",");

    // Get merged SBOM results from all supported plugins
    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);

    // Apply ecosystem filter if specified
    const sbom: SBOMOutput = ecosystem_filter
      ? this.sbomUtilsService.filterSbomByEcosystem(
          mergedSbom,
          ecosystem_filter,
        )
      : mergedSbom;

    const workspaceData = sbom.workspaces[workspace]!;
    const dependenciesArray: SbomDependency[] = [];

    for (const [dep_key, dep] of Object.entries(workspaceData.dependencies)) {
      for (const [version_key, depVersion] of Object.entries(dep)) {
        const version = depVersion as EnhancedDependency;
        const is_direct = this.isDirectDependency(
          dep_key,
          version_key,
          workspaceData.start,
        );

        const sbomDependency: SbomDependency = new SbomDependency();
        sbomDependency.name = dep_key;
        sbomDependency.version = version_key;
        sbomDependency.newest_release = version_key;
        sbomDependency.dev = version.Dev ?? version.dev ?? false;
        sbomDependency.prod = version.Prod ?? version.prod ?? false;
        sbomDependency.is_direct_count = is_direct;
        sbomDependency.is_transitive_count =
          (version.Transitive ?? version.transitive) ? 1 : 0;
        if (version.ecosystem) sbomDependency.ecosystem = version.ecosystem;
        if (version.source_plugin)
          sbomDependency.source_plugin = version.source_plugin;

        // Check package info and deprecation status
        const language = getLanguageFromEcosystem(version.ecosystem);
        await this.enrichSbomDependency(
          sbomDependency,
          dep_key,
          version_key,
          language,
        );

        // Only include dependencies that are actually used
        if (sbomDependency.dev || sbomDependency.prod) {
          dependenciesArray.push(sbomDependency);
        }
      }
    }

    // Filter, sort and paginate the dependencies list
    const [filtered, filterCount] = filter(
      dependenciesArray,
      search_key,
      active_filters,
    );
    const sorted = sort(filtered, sort_by, sort_direction);

    const paginated = paginate<SbomDependency>(
      sorted,
      dependenciesArray.length,
      { currentPage: page, entriesPerPage: entries_per_page },
      { maxEntriesPerPage: 100, defaultEntriesPerPage: 20 },
    );

    paginated.filter_count = filterCount;

    return paginated;
  }

  async getStatus(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
  ): Promise<StatusResponse> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    // Get merged SBOM results from all supported plugins
    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);

    if (mergedSbom.analysis_info.private_errors.length) {
      return {
        public_errors: mergedSbom.analysis_info.public_errors,
        private_errors: mergedSbom.analysis_info.private_errors,
        stage_start: mergedSbom.analysis_info.analysis_start_time,
        stage_end: mergedSbom.analysis_info.analysis_end_time,
      };
    }
    return {
      public_errors: [],
      private_errors: [],
      stage_start: mergedSbom.analysis_info.analysis_start_time,
      stage_end: mergedSbom.analysis_info.analysis_end_time,
    };
  }

  async getWorkspaces(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
  ): Promise<WorkspacesOutput> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    // Get merged SBOM results from all supported plugins
    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);

    return {
      workspaces: Object.keys(mergedSbom.workspaces),
      package_manager: mergedSbom.analysis_info.package_manager,
    };
  }

  async getDependency(
    orgId: string,
    projectId: string,
    analysisId: string,
    workspace: string,
    dependency: string,
    user: AuthenticatedUser,
  ): Promise<DependencyDetails> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    // Get merged SBOM results from all supported plugins
    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);

    // Validate that the workspace exists
    if (!(workspace in mergedSbom.workspaces)) {
      throw new UnknownWorkspace();
    }

    const [dependencyName, dependencyVersion] = dependency.split("@");

    if (
      dependencyName &&
      dependencyName in mergedSbom.workspaces[workspace]!.dependencies
    ) {
      if (
        dependencyVersion &&
        dependencyVersion in
          mergedSbom.workspaces[workspace]!.dependencies[dependencyName]!
      ) {
        return await this.sbomUtilsService.getDependencyData(
          analysisId,
          workspace,
          dependencyName,
          dependencyVersion,
          mergedSbom,
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
    user: AuthenticatedUser,
  ): Promise<GraphDependency[]> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    // Get merged SBOM results from all supported plugins
    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);

    // Validate that the workspace exists
    if (!(workspace in mergedSbom.workspaces)) {
      throw new UnknownWorkspace();
    }

    // Validate dependency parameter
    if (!dependency || dependency.trim() === "") {
      throw new EntityNotFound("Dependency parameter is required");
    }

    const dependenciesMap: Record<
      string,
      Record<string, Dependency>
    > = mergedSbom.workspaces[workspace]!.dependencies;

    // Check if dependencies exist in this workspace
    if (!dependenciesMap || Object.keys(dependenciesMap).length === 0) {
      throw new EntityNotFound("No dependencies found in this workspace");
    }

    // First, build the complete dependency graph
    const completeGraph: GraphDependency[] = this.buildCompleteGraph(
      dependenciesMap,
      mergedSbom.workspaces[workspace]!,
    );

    // Find the target dependency in the complete graph
    const targetNode = completeGraph.find((node) => node.id === dependency);
    const virtualRoot = completeGraph.find(
      (node) => node.id === SBOMService.VIRTUAL_ROOT_ID,
    );
    if (!targetNode) {
      throw new EntityNotFound(
        `Dependency ${dependency} not found in workspace ${workspace}`,
      );
    }

    // If the target node is a direct dependency and does not already have the virtual root as a parent, add it
    if (
      virtualRoot &&
      !targetNode.parentIds?.includes(SBOMService.VIRTUAL_ROOT_ID)
    ) {
      // Add virtual root as parent
      targetNode.parentIds = Array.from(
        new Set([...(targetNode.parentIds ?? []), SBOMService.VIRTUAL_ROOT_ID]),
      );
      // Add target node as child of virtual root if not already present
      virtualRoot.childrenIds ??= [];
      if (!virtualRoot.childrenIds.includes(targetNode.id)) {
        virtualRoot.childrenIds.push(targetNode.id);
      }
    }

    // Find only the paths that contain the target dependency
    // This excludes branches that don't lead to the target
    const pathNodes = GraphTraversalUtils.findMinimalPathsToTarget(
      dependency,
      completeGraph,
    );

    // Ensure the target node is always included (even if it's a direct dependency/root)
    if (!pathNodes.some((node) => node.id === dependency)) {
      const targetNodeInGraph = completeGraph.find(
        (node) => node.id === dependency,
      );
      if (targetNodeInGraph) {
        pathNodes.push(targetNodeInGraph);
      }
    }

    // Always include the virtual root if any of the path nodes are its direct children
    if (virtualRoot && !pathNodes.some((node) => node.id === virtualRoot.id)) {
      // Check if any path node is a child of virtual root
      const hasVirtualRootChild = pathNodes.some((node) =>
        node.parentIds?.includes(SBOMService.VIRTUAL_ROOT_ID),
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
   * @param workspaceData - Workspace data containing start dependencies
   * @returns Complete graph of all dependencies with parent-child relationships rooted at virtual root
   */
  private buildCompleteGraph(
    dependenciesMap: Record<string, Record<string, Dependency>>,
    workspaceData: WorkSpaceData,
  ): GraphDependency[] {
    const graph: GraphDependency[] = [];
    const processedNodes = new Set<string>();

    // Create a virtual root node that will be the parent of all orphaned nodes
    const virtualRootId = SBOMService.VIRTUAL_ROOT_ID;
    const virtualRootNode: GraphDependency = {
      id: virtualRootId,
      parentIds: [],
      childrenIds: [],
      prod: false,
      dev: false,
    };

    // Collect root dependencies from start dependencies
    const rootDependencies = this.collectRootDependencies(workspaceData.start);

    // Process all dependencies and build parent-child relationships
    for (const [depName, versions] of Object.entries(dependenciesMap)) {
      if (!depName || !versions) continue;

      for (const [version, depData] of Object.entries(versions)) {
        if (!version || !depData) continue;

        const nodeId = `${depName}@${version}`;
        if (processedNodes.has(nodeId)) continue;

        const node = this.createGraphNode(
          nodeId,
          depData,
          rootDependencies,
          dependenciesMap,
          virtualRootId,
          virtualRootNode,
        );

        graph.push(node);
        processedNodes.add(nodeId);
      }
    }

    // Add the virtual root node to the graph
    graph.push(virtualRootNode);

    return graph;
  }

  /**
   * Collect root dependencies from start dependencies
   */
  private collectRootDependencies(start: {
    dependencies?: WorkSpaceDependency[];
    dev_dependencies?: WorkSpaceDependency[];
  }): Set<string> {
    const rootDependencies = new Set<string>();

    const addDeps = (deps: WorkSpaceDependency[] | undefined): void => {
      if (!deps) return;
      for (const dep of deps) {
        if (dep.name && dep.version) {
          rootDependencies.add(`${dep.name}@${dep.version}`);
        }
      }
    };

    addDeps(start.dependencies);
    addDeps(start.dev_dependencies);

    return rootDependencies;
  }

  /**
   * Create a graph node for a dependency
   */
  private createGraphNode(
    nodeId: string,
    depData: Dependency,
    rootDependencies: Set<string>,
    dependenciesMap: Record<string, Record<string, Dependency>>,
    virtualRootId: string,
    virtualRootNode: GraphDependency,
  ): GraphDependency {
    const isRoot = rootDependencies.has(nodeId);

    const node: GraphDependency = {
      id: nodeId,
      parentIds: [],
      childrenIds: [],
      prod: !!depData.Prod,
      dev: !!depData.Dev,
    };

    // Add children from Dependencies property
    if (depData.Dependencies && typeof depData.Dependencies === "object") {
      for (const [childName, childVersion] of Object.entries(
        depData.Dependencies,
      )) {
        if (childName && childVersion) {
          node.childrenIds!.push(`${childName}@${childVersion}`);
        }
      }
    }

    // Find all parents for this node
    const parents = this.findParentDependencies(nodeId, dependenciesMap);

    if (parents.length > 0) {
      node.parentIds = parents;
    } else if (isRoot) {
      node.parentIds = [virtualRootId];
      virtualRootNode.childrenIds!.push(nodeId);
    } else {
      // Orphaned node - make it a child of virtual root
      node.parentIds = [virtualRootId];
      virtualRootNode.childrenIds!.push(nodeId);
    }

    return node;
  }

  /**
   * Finds all parent dependencies for a given dependency
   * @param targetDependency - The dependency to find parents for (format: "name@version")
   * @param dependenciesMap - Map of all dependencies
   * @returns Array of parent dependency IDs
   */
  private findParentDependencies(
    targetDependency: string,
    dependenciesMap: Record<string, Record<string, Dependency>>,
  ): string[] {
    if (!targetDependency?.includes("@")) {
      return [];
    }

    const [targetName, targetVersion] = targetDependency.split("@");
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
          typeof depData.Dependencies === "object" &&
          depData.Dependencies[targetName] === targetVersion
        ) {
          parents.push(`${depName}@${version}`);
        }
      }
    }

    return parents;
  }

  /**
   * Check if a dependency is a direct dependency (in start dependencies)
   */
  private isDirectDependency(
    depKey: string,
    versionKey: string,
    start: {
      dependencies?: WorkSpaceDependency[];
      dev_dependencies?: WorkSpaceDependency[];
    },
  ): number {
    const checkDeps = (deps: WorkSpaceDependency[] | undefined): boolean => {
      return (
        deps?.some((d) => d.name === depKey && d.version === versionKey) ??
        false
      );
    };
    return checkDeps(start.dependencies) || checkDeps(start.dev_dependencies)
      ? 1
      : 0;
  }

  /**
   * Enrich SBOM dependency with package info and deprecation status
   */
  private async enrichSbomDependency(
    sbomDependency: SbomDependency,
    depKey: string,
    versionKey: string,
    language: string,
  ): Promise<void> {
    const pack = await this.packageRepository.getPackageInfoWithoutFailing(
      depKey,
      language,
    );
    if (!pack) {
      sbomDependency.deprecated = false;
      return;
    }

    sbomDependency.newest_release = pack.latest_version;

    try {
      const versionInfo = await this.packageRepository.getVersionInfo(
        depKey,
        versionKey,
        language,
      );
      const specificVersion = versionInfo.versions?.[0];
      const extra = specificVersion?.extra;
      const deprecatedValue = extra?.["Deprecated"];

      if (deprecatedValue) {
        sbomDependency.deprecated = true;
        sbomDependency.deprecated_message =
          typeof deprecatedValue === "string"
            ? deprecatedValue
            : "This package is deprecated";
      } else {
        sbomDependency.deprecated = false;
      }
    } catch {
      sbomDependency.deprecated = false;
    }
  }

  /**
   * Process dependency stats for a set of dependencies
   */
  private async processDependencyStats(
    dependencies: Record<string, Record<string, Dependency>>,
    stats: AnalysisStats,
  ): Promise<void> {
    for (const [dep_key, dep] of Object.entries(dependencies)) {
      for (const [version_key, depVersion] of Object.entries(dep)) {
        const version = depVersion as EnhancedDependency;
        // Handle case sensitivity for different plugin formats
        const isDirect = version.Direct ?? version.direct;
        const isTransitive = version.Transitive ?? version.transitive;
        const isBundled = version.Bundled ?? version.bundled;
        const isOptional = version.Optional ?? version.optional;
        const isDev = version.Dev ?? version.dev ?? false;
        const isProd = version.Prod ?? version.prod ?? false;

        // Only count dependencies that are actually used (have dev or prod flags)
        if (!isDev && !isProd) continue;

        if (isBundled) stats.number_of_bundled_dependencies += 1;
        if (isOptional) stats.number_of_optional_dependencies += 1;
        if (isTransitive && isDirect) {
          stats.number_of_both_direct_transitive_dependencies += 1;
        } else if (isTransitive) {
          stats.number_of_transitive_dependencies += 1;
        } else if (isDirect) {
          stats.number_of_direct_dependencies += 1;
        }

        // Check if dependency is outdated/deprecated
        const language = getLanguageFromEcosystem(version.ecosystem);
        await this.checkDependencyVersionStatus(
          dep_key,
          version_key,
          language,
          stats,
        );

        stats.number_of_dependencies += 1;
      }
    }
  }

  /**
   * Check if a dependency version is outdated or deprecated
   */
  private async checkDependencyVersionStatus(
    depKey: string,
    versionKey: string,
    language: string,
    stats: AnalysisStats,
  ): Promise<void> {
    const pack = await this.packageRepository.getPackageInfoWithoutFailing(
      depKey,
      language,
    );
    if (!pack) return;

    if (pack.latest_version && pack.latest_version !== versionKey) {
      stats.number_of_outdated_dependencies += 1;
    }

    try {
      const versionInfo = await this.packageRepository.getVersionInfo(
        depKey,
        versionKey,
        language,
      );
      const specificVersion = versionInfo.versions?.[0];
      const extra = specificVersion?.extra;
      if (extra?.["Deprecated"]) {
        stats.number_of_deprecated_dependencies += 1;
      }
    } catch {
      // Continue if we can't get version info
    }
  }
}
