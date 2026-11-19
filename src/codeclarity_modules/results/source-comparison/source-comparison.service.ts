import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  originKey,
  SourceOriginService,
} from "src/codeclarity_modules/knowledge/comparison/source-origin.service";
import {
  SourceVerdictsNotAvailable,
  UnknownWorkspace,
} from "src/types/error.types";

import { AnalysisResultsService } from "../results.service";
import { VulnerabilitiesUtilsService } from "../vulnerabilities/utils/utils.service";
import type { KnowledgeSnapshot } from "../vulnerabilities/vulnerabilities.types";

import {
  AnalysisSourceComparison,
  compareAnalysisSources,
} from "./instance-comparison";
import type { ComparedWorkspace } from "./source-match.types";
import {
  SourceVerdictExport,
  sourceVerdictExport,
} from "./source-verdict-export";

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
    const { workspaces, snapshot } = await this.readWorkspaces(
      orgId,
      projectId,
      analysisId,
      user,
      workspace,
    );

    const matches = Object.values(workspaces).flatMap((ws) =>
      (ws.Vulnerabilities ?? []).flatMap((v) => v.SourceMatches ?? []),
    );
    const origins = await this.sourceOriginService.originsOf(matches);
    return compareAnalysisSources({
      workspaces,
      snapshot,
      originOf: (match) => origins.get(originKey(match)),
    });
  }

  /** One row per instance and source; throws when the analysis stored no verdicts. */
  async exportVerdicts(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace?: string,
  ): Promise<SourceVerdictExport> {
    const { workspaces, snapshot } = await this.readWorkspaces(
      orgId,
      projectId,
      analysisId,
      user,
      workspace,
    );
    const exported = sourceVerdictExport(workspaces, snapshot);
    if (!exported.available) throw new SourceVerdictsNotAvailable();
    return exported;
  }

  private async readWorkspaces(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace?: string,
  ): Promise<{
    workspaces: Record<string, ComparedWorkspace>;
    snapshot: KnowledgeSnapshot | undefined;
  }> {
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
    return { workspaces, snapshot: output.analysis_info.knowledge_snapshot };
  }
}
