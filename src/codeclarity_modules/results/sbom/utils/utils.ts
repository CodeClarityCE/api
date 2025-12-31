import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { PackageRepository } from "src/codeclarity_modules/knowledge/package/package.repository";
import { Result } from "src/codeclarity_modules/results/result.entity";
import {
  Dependency,
  DependencyDetails,
  Output as SBOMOutput,
  Status,
  WorkSpaceData,
  WorkSpaceDependency,
} from "src/codeclarity_modules/results/sbom/sbom.types";
import { Output as VulnsOutput } from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";
import {
  PluginFailed,
  PluginResultNotAvailable,
  UnknownWorkspace,
} from "src/types/error.types";

import { VulnerabilitiesUtilsService } from "../../vulnerabilities/utils/utils.service";

import { EcosystemMapper } from "./ecosystem-mapper";

/** Extended dependency with ecosystem and source plugin information */
interface EnhancedDependency extends Dependency {
  ecosystem?: string;
  source_plugin?: string;
  transitive?: boolean;
}

@Injectable()
export class SbomUtilsService {
  constructor(
    private readonly vulnerabilitiesUtilsService: VulnerabilitiesUtilsService,
    private readonly packageRepository: PackageRepository,
    @InjectRepository(Result, "codeclarity")
    private resultRepository: Repository<Result>,
  ) {}

  async getSbomData(
    analysis_id: string,
    workspace: string,
  ): Promise<Dependency[]> {
    const sbom: SBOMOutput = await this.getSbomResult(analysis_id);

    // Validate that the workspace exists
    if (!(workspace in sbom.workspaces)) {
      throw new UnknownWorkspace();
    }
    // Generate the list of deps (SBOM)
    const dependenciesArray: Dependency[] = [];

    // for (const [, dep] of Object.entries(dependenciesMap)) {
    //     dependenciesArray.push(dep);
    // }

    return dependenciesArray;
  }

  async getSbomResult(analysis_id: string): Promise<SBOMOutput> {
    const result = await this.resultRepository.findOne({
      relations: { analysis: true },
      where: {
        analysis: {
          id: analysis_id,
        },
        plugin: In(["js-sbom", "php-sbom"]),
      },
      order: {
        analysis: {
          created_on: "DESC",
        },
      },
      cache: true,
    });
    if (!result) {
      throw new PluginResultNotAvailable();
    }

    const sbom: SBOMOutput = result.result as unknown as SBOMOutput;
    if (sbom.analysis_info.status === Status.Failure) {
      throw new PluginFailed();
    }
    return sbom;
  }

  /**
   * Gets all SBOM results from all supported plugins and merges them
   * This method is designed to be language-agnostic and extensible
   */
  async getMergedSbomResults(analysis_id: string): Promise<{
    mergedSbom: SBOMOutput;
    pluginResults: { plugin: string; sbom: SBOMOutput; ecosystem: string }[];
  }> {
    // Get all supported SBOM plugins dynamically
    const supportedPlugins = EcosystemMapper.getSupportedSbomPlugins();

    const results = await this.resultRepository.find({
      relations: { analysis: true },
      where: {
        analysis: {
          id: analysis_id,
        },
        plugin: In(supportedPlugins),
      },
      order: {
        plugin: "ASC", // Consistent ordering
      },
      cache: true,
    });

    if (results.length === 0) {
      throw new PluginResultNotAvailable();
    }

    // Process each plugin result with ecosystem info
    const pluginResults = results
      .map((result) => {
        const sbom = result.result as unknown as SBOMOutput;
        const ecosystemInfo = EcosystemMapper.getEcosystemInfo(result.plugin);

        if (!ecosystemInfo) {
          console.warn(`Unknown plugin: ${result.plugin}`);
          return null;
        }

        // Check if the plugin succeeded
        if (sbom.analysis_info.status === Status.Failure) {
          console.warn(`Plugin ${result.plugin} failed, skipping`);
          return null;
        }

        return {
          plugin: result.plugin,
          sbom,
          ecosystem: ecosystemInfo.ecosystem,
        };
      })
      .filter(
        (
          result,
        ): result is { plugin: string; sbom: SBOMOutput; ecosystem: string } =>
          result !== null,
      );

    if (pluginResults.length === 0) {
      throw new PluginFailed();
    }

    // Merge all SBOMs into a unified structure
    const mergedSbom = this.mergeSbomResults(pluginResults);

    return {
      mergedSbom,
      pluginResults,
    };
  }

  /**
   * Merges multiple SBOM results into a unified structure
   * while preserving ecosystem information for each dependency
   */
  private mergeSbomResults(
    pluginResults: { plugin: string; sbom: SBOMOutput; ecosystem: string }[],
  ): SBOMOutput {
    if (pluginResults.length === 0) {
      throw new Error("No plugin results to merge");
    }

    // Use the first result as the base structure
    const baseSbom = JSON.parse(
      JSON.stringify(pluginResults[0]!.sbom),
    ) as SBOMOutput;

    // Collect all unique workspaces across plugins
    const allWorkspaces = new Set<string>();
    pluginResults.forEach(({ sbom }) => {
      Object.keys(sbom.workspaces).forEach((workspace) =>
        allWorkspaces.add(workspace),
      );
    });

    // Merge workspaces
    for (const workspace of allWorkspaces) {
      const mergedWorkspace = this.mergeWorkspaceData(workspace, pluginResults);
      baseSbom.workspaces[workspace] = mergedWorkspace;
    }

    // Update analysis info to reflect merged status
    baseSbom.analysis_info = {
      ...baseSbom.analysis_info,
      project_name:
        baseSbom.analysis_info.project_name || "Multi-language Project",
      package_manager: "multi-language", // Indicate this is a merged result
    };

    return baseSbom;
  }

  /**
   * Merges workspace data from multiple plugins
   */
  private mergeWorkspaceData(
    workspace: string,
    pluginResults: { plugin: string; sbom: SBOMOutput; ecosystem: string }[],
  ): WorkSpaceData {
    const mergedDependencies: Record<string, Record<string, Dependency>> = {};
    const mergedStartDependencies: WorkSpaceDependency[] = [];
    const mergedStartDevDependencies: WorkSpaceDependency[] = [];

    for (const { sbom, ecosystem, plugin } of pluginResults) {
      const workspaceData = sbom.workspaces[workspace];
      if (!workspaceData) continue;

      // Merge dependencies with ecosystem tracking
      for (const [depName, versions] of Object.entries(
        workspaceData.dependencies || {},
      )) {
        mergedDependencies[depName] ??= {};

        for (const [version, dependency] of Object.entries(versions)) {
          // Add ecosystem and source plugin information
          const enhancedDependency = {
            ...dependency,
            ecosystem,
            source_plugin: plugin,
          };

          mergedDependencies[depName][version] = enhancedDependency;
        }
      }

      // Merge start dependencies
      if (workspaceData.start.dependencies) {
        mergedStartDependencies.push(...workspaceData.start.dependencies);
      }
      if (workspaceData.start.dev_dependencies) {
        mergedStartDevDependencies.push(
          ...workspaceData.start.dev_dependencies,
        );
      }
    }

    const startObj: {
      dependencies?: WorkSpaceDependency[];
      dev_dependencies?: WorkSpaceDependency[];
    } = {};
    if (mergedStartDependencies.length > 0) {
      startObj.dependencies = mergedStartDependencies;
    }
    if (mergedStartDevDependencies.length > 0) {
      startObj.dev_dependencies = mergedStartDevDependencies;
    }

    return {
      dependencies: mergedDependencies,
      start: startObj,
    };
  }

  /**
   * Filters merged SBOM data by ecosystem
   */
  filterSbomByEcosystem(sbom: SBOMOutput, ecosystem: string): SBOMOutput {
    if (!EcosystemMapper.isValidEcosystem(ecosystem)) {
      throw new Error(`Invalid ecosystem filter: ${ecosystem}`);
    }

    const filteredSbom = JSON.parse(JSON.stringify(sbom)) as SBOMOutput;

    for (const [workspaceName, workspaceData] of Object.entries(
      filteredSbom.workspaces,
    )) {
      const filteredDependencies: Record<
        string,
        Record<string, Dependency>
      > = {};

      // Filter dependencies by ecosystem
      for (const [depName, versions] of Object.entries(
        workspaceData.dependencies || {},
      )) {
        const filteredVersions: Record<string, Dependency> = {};

        for (const [version, dependency] of Object.entries(versions)) {
          const enhancedDep = dependency as EnhancedDependency;
          if (enhancedDep.ecosystem === ecosystem) {
            filteredVersions[version] = dependency;
          }
        }

        if (Object.keys(filteredVersions).length > 0) {
          filteredDependencies[depName] = filteredVersions;
        }
      }

      filteredSbom.workspaces[workspaceName] = {
        ...workspaceData,
        dependencies: filteredDependencies,
      };
    }

    return filteredSbom;
  }

  async getDependencyData(
    analysis_id: string,
    workspace: string,
    dependency_name: string,
    dependency_version: string,
    sbom: SBOMOutput,
  ): Promise<DependencyDetails> {
    const dependency =
      sbom.workspaces[workspace]!.dependencies[dependency_name]![
        dependency_version
      ]!;
    const enhancedDep = dependency as EnhancedDependency;

    // Determine the language based on the ecosystem
    const ecosystem = enhancedDep.ecosystem;
    const language = this.getLanguageFromEcosystem(ecosystem);

    // Try to get package version info, but handle cases where it doesn't exist
    let package_version;
    let version;
    try {
      package_version = await this.packageRepository.getVersionInfo(
        dependency_name,
        dependency_version,
        language,
      );
      version = package_version.versions[0];
    } catch (error) {
      // If package info is not available in knowledge database, create minimal info
      console.warn(
        `Package info not found for ${dependency_name}@${dependency_version} (${language}):`,
        (error as Error).message,
      );
      package_version = null;
      version = null;
    }

    const enginesExtra = version?.extra?.["Engines"] as
      | Record<string, string>
      | undefined;
    const timeExtra = version?.extra?.["Time"] as string | undefined;

    const dependency_details: DependencyDetails = {
      name: dependency_name,
      version: version?.version ?? dependency_version,
      latest_version: package_version?.latest_version ?? dependency_version,
      dependencies: version?.dependencies ?? {},
      dev_dependencies: version?.dev_dependencies ?? {},
      transitive: dependency.Transitive ?? enhancedDep.transitive ?? false,
      package_manager: sbom.analysis_info.package_manager,
      license: package_version?.license ?? "",
      engines: enginesExtra ?? {},
      release_date: timeExtra ? new Date(timeExtra) : new Date(),
      lastest_release_date: package_version?.time
        ? new Date(package_version.time)
        : new Date(),
      vulnerabilities: [],
      severity_dist: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        none: 0,
      },
    };
    if (package_version?.source) {
      dependency_details.source = package_version.source;
    }

    // Attach vulnerability info if the service has finished
    await this.attachVulnerabilityInfo(
      analysis_id,
      dependency_name,
      dependency_version,
      dependency_details,
    );

    return dependency_details;
  }

  /**
   * Attach vulnerability information to dependency details
   */
  private async attachVulnerabilityInfo(
    analysis_id: string,
    dependency_name: string,
    dependency_version: string,
    dependency_details: DependencyDetails,
  ): Promise<void> {
    const vulns: VulnsOutput =
      await this.vulnerabilitiesUtilsService.getVulnsResult(analysis_id);

    dependency_details.vulnerabilities = [];

    for (const vuln of vulns.workspaces["."]!.Vulnerabilities) {
      if (
        vuln.AffectedDependency === dependency_name &&
        vuln.AffectedVersion === dependency_version
      ) {
        dependency_details.vulnerabilities.push(vuln.VulnerabilityId);
        this.incrementSeverityCount(
          dependency_details.severity_dist,
          vuln.Severity.SeverityClass,
        );
      }
    }
  }

  /**
   * Increment severity count based on severity class
   */
  private incrementSeverityCount(
    severityDist: DependencyDetails["severity_dist"],
    severityClass: string,
  ): void {
    switch (severityClass) {
      case "CRITICAL":
        severityDist.critical += 1;
        break;
      case "HIGH":
        severityDist.high += 1;
        break;
      case "MEDIUM":
        severityDist.medium += 1;
        break;
      case "LOW":
        severityDist.low += 1;
        break;
      case "NONE":
      default:
        severityDist.none += 1;
        break;
    }
  }

  /**
   * Get programming language from ecosystem identifier
   */
  private getLanguageFromEcosystem(ecosystem: string | undefined): string {
    if (ecosystem === "packagist") return "php";
    if (ecosystem === "pypi") return "python";
    return "javascript"; // default
  }

  // export async function getParents(
  //     dependenciesMap: {
  //         [key: string]: Dependency;
  //     },
  //     dependency: string,
  //     parentsSet: Set<string> = new Set()
  // ): Promise<WorkSpaceData> {
  //     const graph: WorkSpaceData = {
  //         start_dev_deps: [],
  //         start_deps: [],
  //         dependencies: {},
  //         start_deps_constraints: {},
  //         start_dev_deps_constraints: {}
  //     };

  //     if (parentsSet.has(dependency)) {
  //         return graph;
  //     }

  //     graph.dependencies[dependency] = dependenciesMap[dependency];

  //     // If top level dependency
  //     if (dependenciesMap[dependency].is_direct_count > 0) {
  //         if (dependenciesMap[dependency].is_dev_count > 0) {
  //             graph.start.dev_dependencies.push(dependency);
  //             graph.start_dev_deps_constraints[dependency] = dependenciesMap[dependency].version;
  //         }
  //         if (dependenciesMap[dependency].is_prod_count > 0) {
  //             graph.start.dependencies.push(dependency);
  //             graph.start_deps_constraints[dependency] = dependenciesMap[dependency].version;
  //         }
  //     }

  //     if (dependenciesMap[dependency].parents.length !== 0) {
  //         const parents: string[] = dependenciesMap[dependency].parents;
  //         parentsSet.add(dependency);
  //         for (const parent of parents) {
  //             const parentGraph: WorkSpaceData = await getParents(
  //                 dependenciesMap,
  //                 parent,
  //                 parentsSet
  //             );
  //             for (const [, value] of Object.entries(parentGraph.start_deps)) {
  //                 graph.start.dependencies.push(value);
  //             }
  //             for (const [, value] of Object.entries(parentGraph.start_dev_deps)) {
  //                 graph.start.dev_dependencies.push(value);
  //             }

  //             for (const [key, value] of Object.entries(parentGraph.dependencies)) {
  //                 graph.dependencies[key] = value;
  //             }
  //         }
  //     }

  //     graph.start.dependencies = Array.from(new Set(graph.start_deps));
  //     graph.start.dev_dependencies = Array.from(new Set(graph.start_dev_deps));
  //     return graph;
  // }
}
