import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";

import { AnalysisSourceComparison } from "./instance-comparison";
import { SourceComparisonService } from "./source-comparison.service";

@ApiTags("Results - Knowledge source comparison")
@Controller("/org/:org_id/projects/:project_id/analysis")
export class SourceComparisonController {
  constructor(private readonly comparisonService: SourceComparisonService) {}

  @Get(":analysis_id/vulnerabilities/source-comparison")
  @ApiOperation({
    summary: "Compare knowledge sources over an analysis's vulnerabilities",
    description:
      "Coverage, overlap, severity and affected-version disagreement, and disclosure lag of each knowledge source, over one workspace or all of them.",
  })
  async get(
    @Param("org_id") orgId: string,
    @Param("project_id") projectId: string,
    @Param("analysis_id") analysisId: string,
    @AuthUser() user: AuthenticatedUser,
    @Query("workspace") workspace?: string,
  ): Promise<TypedResponse<AnalysisSourceComparison>> {
    return {
      data: await this.comparisonService.compare(
        orgId,
        projectId,
        analysisId,
        user,
        workspace,
      ),
    };
  }
}
