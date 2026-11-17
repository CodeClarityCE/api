import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  ManifestUpgrade,
  newPatchingAnalysisStats,
  Output as PatchesOutput,
  PatchedManifestData,
  PatchInfo,
  PatchingAnalysisStats,
  SemVer,
  Workspace,
} from "src/codeclarity_modules/results/patching/patching.types";
import {
  Output as SbomOutput,
  WorkSpaceDependency,
} from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  StatusError,
  StatusResponse,
} from "src/codeclarity_modules/results/status.types";
import { UnknownWorkspace, Unsupported } from "src/types/error.types";

import { AnalysisResultsService } from "../results.service";
import { SbomUtilsService } from "../sbom/utils/utils";

import { PatchingUtilsService } from "./utils/utils";

/** Query options for patching list endpoint */
export interface PatchingQueryOptions {
  workspace: string;
  page?: number | undefined;
  entriesPerPage?: number | undefined;
  sortBy?: string | undefined;
  sortDirection?: string | undefined;
  activeFilters?: string | undefined;
  searchKey?: string | undefined;
}

@Injectable()
export class PatchingService {
  constructor(
    private readonly analysisResultsService: AnalysisResultsService,
    private readonly patchingUtilsService: PatchingUtilsService,
    private readonly sbomUtilsService: SbomUtilsService,
  ) {}

  async getPatches(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    options: PatchingQueryOptions,
  ): Promise<Workspace> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const { workspace } = options;

    // Query options (page, entriesPerPage, sortBy, sortDirection, activeFilters, searchKey)
    // are available in options but currently unused - kept for future pagination support

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);
    // const sbomOutput: SbomOutput = await getSbomResult(analysisId);
    // const _vulnOutput: VulnsOuptut =
    //     await this.vulnerabilitiesUtilsService.getVulnsResult(analysisId);

    if (!(workspace in patchesOutput.workspaces)) {
      throw new UnknownWorkspace();
    }

    return patchesOutput.workspaces[workspace]!;
  }

  async getPatchedManifest(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace: string,
  ): Promise<PatchedManifestData> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);
    const sbomOutput: SbomOutput =
      await this.sbomUtilsService.getSbomResult(analysisId);

    const patches = patchesOutput.workspaces[workspace];
    const sbomWorkspace = sbomOutput.workspaces?.[workspace];
    if (!patches || !sbomWorkspace) {
      throw new UnknownWorkspace();
    }

    const packageManager = sbomOutput.analysis_info.package_manager;
    if (!JS_PACKAGE_MANAGERS.has(packageManager)) {
      throw new Unsupported();
    }

    const dependencies = manifestUpgrades(
      sbomWorkspace.start.dependencies ?? [],
      patches.patches ?? {},
    );
    const devDependencies = manifestUpgrades(
      sbomWorkspace.start.dev_dependencies ?? [],
      patches.dev_patches ?? {},
    );
    return {
      patched_manifest: { dependencies, devDependencies },
      patched_manifest_raw: JSON.stringify(
        {
          dependencies: upgradedConstraints(dependencies),
          devDependencies: upgradedConstraints(devDependencies),
        },
        null,
        2,
      ),
      other_info: {
        package_manager: packageManager,
        relative_package_file:
          workspace === "." ? "package.json" : `${workspace}/package.json`,
      },
    };
  }

  async getStats(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace: string,
  ): Promise<PatchingAnalysisStats> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    // function getContinuousFromDiscreteCIA(metric: string): number {
    //     if (metric === 'COMPLETE') return 1.0; // CVSS 2
    //     if (metric === 'PARTIAL') return 0.5; // CVSS 2
    //     if (metric === 'HIGH') return 1.0; // CVSS 3
    //     if (metric === 'LOW') return 0.5; // CVSS 3
    //     return 0.0;
    // }

    const _patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);
    // const sbomOutput: SbomOutput = await getSbomResult(analysisId);
    // const _vulnsOutput: VulnsOuptut =
    //     await this.vulnerabilitiesUtilsService.getVulnsResult(analysisId);

    if (!(workspace in _patchesOutput.workspaces)) {
      throw new UnknownWorkspace();
    }

    const stats: PatchingAnalysisStats = newPatchingAnalysisStats();

    return stats;
  }

  // async getPatchTree(
  //     orgId: string,
  //     projectId: string,
  //     analysisId: string,
  //     user: AuthenticatedUser,
  //     workspace: string
  // ): Promise<{ [key: string]: PatchOccurenceInfo }> {
  //     await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

  //     const _patchesOutput: PatchesOutput = await getPatchingResult(analysisId);
  //     const sbomOutput: SbomOutput = await getSbomResult(analysisId);

  //     if (!(workspace in _patchesOutput.workspaces)) {
  //         throw new UnknownWorkspace();
  //     }

  //     if (
  //         sbomOutput.analysis_info.package_manager === 'NPM' ||
  //         sbomOutput.analysis_info.package_manager === 'YARN' ||
  //         sbomOutput.analysis_info.package_manager === 'PNPM'
  //     ) {
  //         return this.getPatchTreeJSEcosystem(_patchesOutput, workspace);
  //     }

  //     // Add other languages / package managers here

  //     throw new Unsupported();
  // }

  // private async getPatchTreeJSEcosystem(
  //     _patchesOutput: PatchesOutput,
  //     workspace: string
  // ): Promise<{ [key: string]: PatchOccurenceInfo }> {
  //     const overall_paths: { [key: string]: PatchOccurenceInfo } = {};
  //     // for (const [key, patch] of Object.entries(
  //     //     _patchesOutput.workspaces[workspace].vulnerability_patch_info
  //     // )) {
  //     //     if (patch && patch.patches) {
  //     //         const paths: string[][] = [];
  //     //         const patched_paths: string[][] = [];
  //     //         const unpatched_paths: string[][] = [];
  //     //         const introduced_paths: string[][] = [];
  //     //         for (const [, directDepPatchInfo] of Object.entries(patch.patches)) {
  //     //             if ('patched_occurences' in directDepPatchInfo) {
  //     //                 paths.push(...directDepPatchInfo['patched_occurences'].Paths);
  //     //                 patched_paths.push(...directDepPatchInfo['patched_occurences'].Paths);
  //     //             }
  //     //             if ('unpatched_occurences' in directDepPatchInfo) {
  //     //                 paths.push(...directDepPatchInfo['unpatched_occurences'].Paths);
  //     //                 unpatched_paths.push(...directDepPatchInfo['unpatched_occurences'].Paths);
  //     //             }
  //     //             if ('introduced_occurences' in directDepPatchInfo) {
  //     //                 paths.push(...directDepPatchInfo['introduced_occurences'].Paths);
  //     //                 introduced_paths.push(...directDepPatchInfo['introduced_occurences'].Paths);
  //     //             }
  //     //         }
  //     //         overall_paths[key] = {
  //     //             affected_deps: patch.affected_deps,
  //     //             vulnerability_id: key,
  //     //             all_occurences: paths,
  //     //             patched_occurences: patched_paths,
  //     //             unpatched_occurences: unpatched_paths,
  //     //             introduced_occurences: introduced_paths
  //     //         };
  //     //     }
  //     // }

  //     return overall_paths;
  // }

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

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);

    if (patchesOutput.analysis_info.private_errors.length) {
      return {
        public_errors: patchesOutput.analysis_info
          .public_errors as StatusError[],
        private_errors: patchesOutput.analysis_info
          .private_errors as StatusError[],
        stage_start: patchesOutput.analysis_info.analysis_start_time,
        stage_end: patchesOutput.analysis_info.analysis_end_time,
      };
    }
    return {
      public_errors: [],
      private_errors: [],
      stage_start: patchesOutput.analysis_info.analysis_start_time,
      stage_end: patchesOutput.analysis_info.analysis_end_time,
    };
  }
}

const JS_PACKAGE_MANAGERS = new Set(["NPM", "YARN", "PNPM"]);

/** Each direct dependency with the upgrade its patch suggests, if it has one. */
function manifestUpgrades(
  direct: WorkSpaceDependency[],
  patches: Record<string, PatchInfo>,
): Record<string, ManifestUpgrade> {
  const upgrades: Record<string, ManifestUpgrade> = {};
  for (const dependency of direct) {
    const patch = patches[`${dependency.name}@${dependency.version}`];
    const upgradable = patch !== undefined && patch.IsPatchable !== "NONE";
    upgrades[dependency.name] = {
      original_constraint: dependency.constraint,
      vulnerable: patch !== undefined,
      patch_type: patch?.IsPatchable ?? null,
      upgrade_to: upgradable ? semverString(patch.Update) : null,
      potential_breaking_changes:
        upgradable && patch.PotentiallyBreaking === true,
    };
  }
  return upgrades;
}

function semverString(version: SemVer): string {
  const base = `${version.Major}.${version.Minor}.${version.Patch}`;
  return version.PreReleaseTag ? `${base}-${version.PreReleaseTag}` : base;
}

/** The manifest constraints after upgrading; a ^ or ~ range keeps its operator. */
function upgradedConstraints(
  upgrades: Record<string, ManifestUpgrade>,
): Record<string, string> {
  const constraints: Record<string, string> = {};
  for (const [name, upgrade] of Object.entries(upgrades)) {
    if (upgrade.upgrade_to === null) {
      constraints[name] = upgrade.original_constraint;
      continue;
    }
    const operator = /^[\^~]\d/.test(upgrade.original_constraint)
      ? upgrade.original_constraint[0]
      : "";
    constraints[name] = `${operator}${upgrade.upgrade_to}`;
  }
  return constraints;
}
