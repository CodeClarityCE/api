import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  originKey,
  SourceOriginService,
} from "src/codeclarity_modules/knowledge/comparison/source-origin.service";
import { UnknownWorkspace } from "src/types/error.types";

import { AnalysisResultsService } from "../results.service";
import { VulnerabilitiesUtilsService } from "../vulnerabilities/utils/utils.service";

import {
  AnalysisSourceComparison,
  compareAnalysisSources,
} from "./instance-comparison";
import type {
  AnalysisSourceSnapshot,
  ComparedWorkspace,
} from "./source-match.types";

@Injectable()
export class SourceComparisonService {
  constructor(
    private readonly analysisResultsService: AnalysisResultsService,
    private readonly vulnerabilitiesUtils: VulnerabilitiesUtilsService,
    private readonly sourceOriginService: SourceOriginService,
  ) {}

  /** Compares the knowledge sources over one analysis, in one workspace or all of them. */

  async compare(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace?: string,
  ): Promise<AnalysisSourceComparison> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );
    const output = await this.vulnerabilitiesUtils.getVulnsResult(analysisId);
    const all = output.workspaces as unknown as Record<
      string,
      ComparedWorkspace
    >;
    let workspaces = all;
    if (workspace) {
      if (!(workspace in all)) throw new UnknownWorkspace();
      workspaces = { [workspace]: all[workspace]! };
    }

    const matches = Object.values(workspaces).flatMap((ws) =>
      (ws.Vulnerabilities ?? []).flatMap((v) => v.SourceMatches ?? []),
    );
    const origins = await this.sourceOriginService.originsOf(matches);
    const info = output.analysis_info as {
      knowledge_snapshot?: AnalysisSourceSnapshot;
    };
    return compareAnalysisSources({
      workspaces,
      snapshot: info.knowledge_snapshot,
      originOf: (match) => origins.get(originKey(match)),
    });
  }
}
