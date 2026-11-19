import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  encodeCsvHeader,
  encodeCsvRow,
} from "src/codeclarity_modules/experiments/experiment-csv";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";

import { AnalysisSourceComparison } from "./instance-comparison";
import { SourceComparisonService } from "./source-comparison.service";

enum VerdictExportFormat {
  Csv = "csv",
  Json = "json",
}

const CONTENT_TYPES: Record<VerdictExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
};

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

  // Writes to the raw reply so the file downloads; errors are thrown before any header.
  @Get(":analysis_id/vulnerabilities/source-verdicts")
  @ApiOperation({
    summary: "Export every source verdict of an analysis",
    description:
      "One row per vulnerability instance and knowledge source: the verdict, its evidence, and whether the source was stale or failed when the analysis ran. Answers 409 SourceVerdictsNotAvailable for an analysis stored without verdicts.",
  })
  @ApiQuery({ name: "format", enum: VerdictExportFormat })
  @ApiQuery({ name: "workspace", required: false })
  @ApiProduces(CONTENT_TYPES.csv, CONTENT_TYPES.json)
  async exportVerdicts(
    @Param("org_id") orgId: string,
    @Param("project_id") projectId: string,
    @Param("analysis_id") analysisId: string,
    @AuthUser() user: AuthenticatedUser,
    @Query("format", new ParseEnumPipe(VerdictExportFormat))
    format: VerdictExportFormat,
    @Res() reply: FastifyReply,
    @Query("workspace") workspace?: string,
  ): Promise<void> {
    const { columns, rows } = await this.comparisonService.exportVerdicts(
      orgId,
      projectId,
      analysisId,
      user,
      workspace,
    );
    const body =
      format === VerdictExportFormat.Csv
        ? encodeCsvHeader(columns) +
          rows.map((row) => encodeCsvRow(columns, row)).join("")
        : JSON.stringify({ analysis_id: analysisId, columns, rows });
    const safeId = analysisId.replace(/[^A-Za-z0-9._-]/g, "_");
    await reply
      .header("content-type", CONTENT_TYPES[format])
      .header(
        "content-disposition",
        `attachment; filename="source-verdicts-${safeId}.${format}"`,
      )
      .send(body);
  }
}
