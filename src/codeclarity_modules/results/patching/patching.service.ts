import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  newPatchingAnalysisStats,
  Output as PatchesOutput,
  PatchingAnalysisStats,
  Workspace,
} from "src/codeclarity_modules/results/patching/patching.types";
import {
  AnalysisInfo as SbomAnalysisInfo,
  Output as SbomOutput,
} from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  StatusError,
  StatusResponse,
} from "src/codeclarity_modules/results/status.types";
import { UnknownWorkspace } from "src/types/error.types";

import { AnalysisResultsService } from "../results.service";
import { SbomUtilsService } from "../sbom/utils/utils";

import { PatchingUtilsService } from "./utils/utils";

/** Query options for patching list endpoint */
export interface PatchingQueryOptions {
  workspace: string;
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

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);
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
  ): Promise<SbomAnalysisInfo | Record<string, never>> {
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

    if (!(workspace in patchesOutput.workspaces)) {
      throw new UnknownWorkspace();
    }

    if (
      sbomOutput.analysis_info.package_manager === "NPM" ||
      sbomOutput.analysis_info.package_manager === "YARN" ||
      sbomOutput.analysis_info.package_manager === "PNPM"
    ) {
      return sbomOutput.analysis_info;
    }

    // Add other languages / package managers here

    return {};
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
