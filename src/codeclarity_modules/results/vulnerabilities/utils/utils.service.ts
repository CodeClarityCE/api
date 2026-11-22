import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Output as PatchesOutput } from "src/codeclarity_modules/results/patching/patching.types";
import {
  NEWEST_RESULT_FIRST,
  Result,
} from "src/codeclarity_modules/results/result.entity";
import { Dependency } from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  KnowledgeSnapshot,
  MaliciousPackageAdvisory,
  Output as VulnsOutput,
  PatchType,
  Status,
  Vulnerability,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";
import { Status as PluginStatus } from "src/types/apiResponses.types";
import {
  PluginFailed,
  PluginResultNotAvailable,
  UnknownWorkspace,
} from "src/types/error.types";

import {
  emptyHiddenCounts,
  type HiddenCounts,
  HiddenReason,
  instanceStatus,
} from "./instance-status";

/** Filters that show instances hidden by default. */
export interface HiddenFilters {
  show_contradicted?: boolean;
  show_retired?: boolean;
}

/** A workspace's findings after the hidden filters, with what they hid. */
export interface FindingsView {
  findings: Vulnerability[];
  hidden_counts: HiddenCounts;
  /** False for analyses made before source verdicts; they hide nothing. */
  source_verdicts_available: boolean;
}

@Injectable()
export class VulnerabilitiesUtilsService {
  constructor(
    @InjectRepository(Result, "codeclarity")
    private resultRepository: Repository<Result>,
  ) {}

  async getVulnsResult(analysis_id: string): Promise<VulnsOutput> {
    // Try to get results from the multi-language vuln-finder plugin first
    let result = await this.resultRepository.findOne({
      relations: { analysis: true },
      where: {
        analysis: {
          id: analysis_id,
        },
        plugin: "vuln-finder",
      },
      order: NEWEST_RESULT_FIRST,
      cache: true,
    });

    // Fall back to js-vuln-finder for backward compatibility
    result ??= await this.resultRepository.findOne({
      relations: { analysis: true },
      where: {
        analysis: {
          id: analysis_id,
        },
        plugin: "js-vuln-finder",
      },
      order: NEWEST_RESULT_FIRST,
      cache: true,
    });

    if (!result) {
      throw new PluginResultNotAvailable();
    }

    const vulns: VulnsOutput = result.result as unknown as VulnsOutput;
    if (vulns.analysis_info.status === Status.Failure) {
      throw new PluginFailed();
    }
    return vulns;
  }

  /** The workspace's findings without the instances hidden by default, unless a filter shows them. */
  async getFindingsData(
    analysis_id: string,
    workspace: string,
    ecosystem_filter?: string,
    filters: HiddenFilters = {},
  ): Promise<Vulnerability[]> {
    return (
      await this.getFindingsView(
        analysis_id,
        workspace,
        ecosystem_filter,
        filters,
      )
    ).findings;
  }

  async getFindingsView(
    analysis_id: string,
    workspace: string,
    ecosystem_filter?: string,
    filters: HiddenFilters = {},
  ): Promise<FindingsView> {
    const findings: VulnsOutput = await this.getVulnsResult(analysis_id);

    // Validate that the workspace exists
    if (!(workspace in findings.workspaces)) {
      throw new UnknownWorkspace();
    }

    let vulnerabilities = findings.workspaces[workspace]!.Vulnerabilities ?? [];

    // Apply ecosystem filter if specified
    if (ecosystem_filter) {
      vulnerabilities = this.filterVulnerabilitiesByEcosystem(
        vulnerabilities,
        ecosystem_filter,
      );
    }

    // // Attach sbom info
    // try {
    //     const sbomInfo: SbomOutput = await getSbomResult(analysis_id);
    //     // Validate that the workspace exists
    //     if (workspace in sbomInfo.workspaces) {
    //         for (const vuln of vulnerabilities) {
    //             if (vuln.AffectedDependency in sbomInfo.workspaces[workspace].dependencies)
    //                 vuln.AffectedDependencyObject =
    //                     sbomInfo.workspaces[workspace].dependencies[vuln.AffectedDependency];
    //         }
    //     }
    // } catch (err) {
    //     // Nothing to throw here
    // }

    // Attach patch status only when the patching plugin produced a result
    const patchTypes = await this.getPatchTypes(analysis_id, workspace);
    for (const vuln of vulnerabilities) {
      const patchType = patchTypes.get(occurrenceKey(vuln));
      if (patchType) vuln.PatchType = patchType;
    }

    // Judge each instance from its source verdicts, then drop the hidden ones
    const hidden_counts = emptyHiddenCounts();
    const shown: Record<HiddenReason, boolean> = {
      [HiddenReason.Contradicted]: filters.show_contradicted === true,
      [HiddenReason.RetiredAll]: filters.show_retired === true,
    };
    const visible: Vulnerability[] = [];
    for (const vuln of vulnerabilities) {
      const status = instanceStatus(vuln.SourceVerdicts, vuln.Ecosystem);
      if (status.contradicted_by.length > 0) {
        vuln.ContradictedBy = status.contradicted_by;
      }
      if (status.hidden) {
        vuln.Hidden = status.hidden;
        hidden_counts[status.hidden]++;
        if (!shown[status.hidden]) continue;
      }
      visible.push(vuln);
    }

    return {
      findings: visible,
      hidden_counts,
      source_verdicts_available: Object.values(findings.workspaces).some((ws) =>
        (ws.Vulnerabilities ?? []).some((f) => f.SourceVerdicts),
      ),
    };
  }

  /**
   * Patch status of each vulnerable dependency, from the newest js-patching result.
   * Empty when patching did not run or failed.
   */
  private async getPatchTypes(
    analysis_id: string,
    workspace: string,
  ): Promise<Map<string, PatchType>> {
    const patchTypes = new Map<string, PatchType>();
    const result = await this.resultRepository.findOne({
      relations: { analysis: true },
      where: { analysis: { id: analysis_id }, plugin: "js-patching" },
      order: NEWEST_RESULT_FIRST,
      cache: true,
    });
    if (!result) return patchTypes;
    const patches = result.result as unknown as PatchesOutput;
    if (patches.analysis_info?.status === PluginStatus.Failure)
      return patchTypes;
    const workspaceData = patches.workspaces?.[workspace];
    if (!workspaceData) return patchTypes;

    // A vulnerability can be reached through several direct dependencies
    const fixable = new Map<
      string,
      { patchable: boolean; unpatchable: boolean }
    >();
    const mark = (
      list: { Vulnerability: Vulnerability }[] | null | undefined,
      field: "patchable" | "unpatchable",
    ): void => {
      for (const entry of list ?? []) {
        const key = occurrenceKey(entry.Vulnerability);
        const seen = fixable.get(key) ?? {
          patchable: false,
          unpatchable: false,
        };
        seen[field] = true;
        fixable.set(key, seen);
      }
    };
    for (const patch of [
      ...Object.values(workspaceData.patches ?? {}),
      ...Object.values(workspaceData.dev_patches ?? {}),
    ]) {
      mark(patch.Patchable, "patchable");
      mark(patch.Unpatchable, "unpatchable");
    }

    for (const [key, { patchable, unpatchable }] of fixable) {
      if (patchable && unpatchable) patchTypes.set(key, PatchType.Partial);
      else if (patchable) patchTypes.set(key, PatchType.Full);
      else patchTypes.set(key, PatchType.None);
    }
    return patchTypes;
  }

  async getMaliciousPackageAdvisories(
    analysis_id: string,
    workspace: string,
  ): Promise<MaliciousPackageAdvisory[]> {
    const findings: VulnsOutput = await this.getVulnsResult(analysis_id);

    if (!(workspace in findings.workspaces)) {
      throw new UnknownWorkspace();
    }

    return findings.workspaces[workspace]!.MaliciousPackageAdvisories ?? [];
  }

  /** The analysis's knowledge source snapshot, or null for an older analysis. */
  async getKnowledgeSnapshot(
    analysis_id: string,
  ): Promise<KnowledgeSnapshot | null> {
    const findings: VulnsOutput = await this.getVulnsResult(analysis_id);
    return findings.analysis_info.knowledge_snapshot ?? null;
  }

  async getImportPaths(
    dependenciesMap: Record<string, Dependency>,
    dependency: string,
    currentPath: string,
    paths: string[] = new Array<string>(),
    parentsSet = new Set<string>(),
  ): Promise<string[]> {
    const currentDependency = dependenciesMap[dependency];
    console.warn(currentDependency);

    // If the dependency is already in the path, we stop the recursion
    if (parentsSet.has(dependency) || currentPath.includes(dependency)) {
      parentsSet.clear();
      return paths;
    }

    // currentPath = `${currentDependency.key} -> ${currentPath}`;

    // if (currentDependency.parents.length === 0) {
    //     if (currentPath.endsWith(' -> ')) currentPath = currentPath.slice(0, -4);
    //     paths.push(currentPath);
    //     parentsSet.clear();
    //     return paths;
    // } else if (currentDependency.is_direct_count > 0) {
    //     // If the dependency is direct, we add it to the path too
    //     if (currentPath.endsWith(' -> ')) currentPath = currentPath.slice(0, -4);
    //     paths.push(currentPath);
    // }

    // for (const dep of currentDependency.parents) {
    //     parentsSet.add(dependency);
    //     await getImportPaths(dependenciesMap, dep, currentPath, paths, parentsSet);
    // }

    return paths;
  }

  /**
   * Filters vulnerabilities by ecosystem (e.g., 'npm', 'packagist')
   * Uses package naming patterns to determine ecosystem
   */
  private filterVulnerabilitiesByEcosystem(
    vulnerabilities: Vulnerability[],
    ecosystem: string,
  ): Vulnerability[] {
    return vulnerabilities.filter((vuln) => {
      const packageName = vuln.AffectedDependency;
      const detectedEcosystem = this.detectPackageEcosystem(packageName);
      return detectedEcosystem === ecosystem;
    });
  }

  /**
   * Detects the ecosystem of a package based on naming patterns
   */
  private detectPackageEcosystem(packageName: string): string {
    // PHP packages often have vendor/package format
    if (packageName.includes("/") && !packageName.startsWith("@")) {
      return "packagist";
    }

    // Scoped npm packages start with @
    if (packageName.startsWith("@")) {
      return "npm";
    }

    // Most other single-name packages are likely npm
    // This is a heuristic that may need refinement
    return "npm";
  }
}

/** One vulnerability in one installed dependency version. */
function occurrenceKey(
  vuln: Pick<
    Vulnerability,
    "VulnerabilityId" | "AffectedDependency" | "AffectedVersion"
  >,
): string {
  return `${vuln.VulnerabilityId}|${vuln.AffectedDependency}@${vuln.AffectedVersion}`;
}
