import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { FastifyReply } from "fastify";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  CreatedResponse,
  NoDataResponse,
  TypedPaginatedResponse,
  TypedResponse,
} from "src/types/apiResponses.types";

import { PROBES_PER_ENTRY_INTERVAL } from "./experiment-budget";
import type { FigureCatalog } from "./experiment-figure-catalog";
import type { FigureData } from "./experiment-figure-data";
import {
  ExperimentFiguresService,
  type FigureSummary,
} from "./experiment-figures.service";
import type { ExperimentResults } from "./experiment-results";
import {
  ExperimentResultsService,
  type PublishedResultsSummary,
} from "./experiment-results.service";
import { ExperimentsService } from "./experiments.service";
import {
  CreateExperimentBody,
  CreateFigureBody,
  ExperimentEstimateBasis,
  ExperimentRunSummary,
  ExperimentSummary,
  FigureDataBody,
  UpdateFigureBody,
} from "./experiments.types";

const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const ZIP_CONTENT_TYPE = "application/zip";

/** An attachment header naming the file after the experiment. */
function attachment(experimentName: string, file: string): string {
  const safeName = experimentName.replace(/[^A-Za-z0-9._-]/g, "_");
  return `attachment; filename="${safeName}-${file}"`;
}

@ApiTags("Experiments")
@Controller("org/:org_id/experiments")
export class ExperimentsController {
  constructor(
    private readonly experimentsService: ExperimentsService,
    private readonly resultsService: ExperimentResultsService,
    private readonly figuresService: ExperimentFiguresService,
  ) {}

  @Post("")
  @ApiOperation({
    summary: "Create an experiment: one analyzer over every dataset entry",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiResponse({ status: 201, description: "Experiment registered, pending" })
  @ApiResponse({
    status: 400,
    description: "Dataset not READY or analyzer lacks js-sbom / vuln-finder",
  })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 409, description: "Name already used in the org" })
  async create(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Body() body: CreateExperimentBody,
  ): Promise<CreatedResponse> {
    const id = await this.experimentsService.create(org_id, body, user);
    return { id };
  }

  @Get("")
  @ApiOperation({ summary: "List the experiments of an organization" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "entries_per_page", required: false })
  async getMany(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Query("page", new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query("entries_per_page", new DefaultValuePipe(20), ParseIntPipe)
    entries_per_page: number,
  ): Promise<TypedPaginatedResponse<ExperimentSummary>> {
    return this.experimentsService.getMany(
      org_id,
      { currentPage: page, entriesPerPage: entries_per_page },
      user,
    );
  }

  @Get("estimate")
  @ApiOperation({
    summary: "What the create form estimates an experiment's analyses from",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  getEstimate(): TypedResponse<ExperimentEstimateBasis> {
    return { data: { probes_per_entry_interval: PROBES_PER_ENTRY_INTERVAL } };
  }

  @Get(":experiment_id")
  @ApiOperation({ summary: "Get an experiment with its run counts" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  async get(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<TypedResponse<ExperimentSummary>> {
    return {
      data: await this.experimentsService.get(org_id, experiment_id, user),
    };
  }

  @Get(":experiment_id/runs")
  @ApiOperation({ summary: "List the runs of an experiment by entry rank" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "entries_per_page", required: false })
  async getRuns(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Query("page", new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query("entries_per_page", new DefaultValuePipe(100), ParseIntPipe)
    entries_per_page: number,
  ): Promise<TypedPaginatedResponse<ExperimentRunSummary>> {
    return this.experimentsService.getRuns(
      org_id,
      experiment_id,
      { currentPage: page, entriesPerPage: entries_per_page },
      user,
    );
  }

  @Get(":experiment_id/results")
  @ApiOperation({
    summary:
      "Dataset-level results of an experiment, computed from its done runs",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  async getResults(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<TypedResponse<ExperimentResults>> {
    return {
      data: await this.resultsService.getResults(org_id, experiment_id, user),
    };
  }

  /*
   * Downloads write to the raw reply (@Res), bypassing the response body
   * interceptor: the CSVs stream chunk by chunk and are never buffered.
   * Authorization and the 404 happen before any header is sent.
   */

  @Get(":experiment_id/export/runs.csv")
  @ApiOperation({
    summary:
      "Download one CSV row per run: state, pinned commit, entry, summary",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiProduces("text/csv")
  async exportRunsCsv(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { experiment_name, stream } = await this.resultsService.exportRunsCsv(
      org_id,
      experiment_id,
      user,
    );
    await reply
      .header("content-type", CSV_CONTENT_TYPE)
      .header("content-disposition", attachment(experiment_name, "runs.csv"))
      .send(stream);
  }

  @Get(":experiment_id/export/vulnerabilities.csv")
  @ApiOperation({
    summary: "Download one CSV row per vulnerability instance of done runs",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiProduces("text/csv")
  async exportVulnerabilitiesCsv(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { experiment_name, stream } =
      await this.resultsService.exportVulnerabilitiesCsv(
        org_id,
        experiment_id,
        user,
      );
    await reply
      .header("content-type", CSV_CONTENT_TYPE)
      .header(
        "content-disposition",
        attachment(experiment_name, "vulnerabilities.csv"),
      )
      .send(stream);
  }

  @Get(":experiment_id/export/exposures.csv")
  @ApiOperation({
    summary: "Download one CSV row per exposure, with its introduction and fix",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiProduces("text/csv")
  async exportExposuresCsv(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { experiment_name, stream } =
      await this.resultsService.exportExposuresCsv(org_id, experiment_id, user);
    await reply
      .header("content-type", CSV_CONTENT_TYPE)
      .header(
        "content-disposition",
        attachment(experiment_name, "exposures.csv"),
      )
      .send(stream);
  }

  @Get(":experiment_id/export/fixes.csv")
  @ApiOperation({
    summary: "Download one CSV row per fix: kind, dating precision and lag",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiProduces("text/csv")
  async exportFixesCsv(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { experiment_name, stream } =
      await this.resultsService.exportFixesCsv(org_id, experiment_id, user);
    await reply
      .header("content-type", CSV_CONTENT_TYPE)
      .header("content-disposition", attachment(experiment_name, "fixes.csv"))
      .send(stream);
  }

  @Get(":experiment_id/export/results.json")
  @ApiOperation({
    summary: "Download the results payload (not wrapped in data) as a file",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiProduces("application/json")
  async exportResults(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { experiment_name, results } =
      await this.resultsService.exportResults(org_id, experiment_id, user);
    await reply
      .header("content-type", JSON_CONTENT_TYPE)
      .header(
        "content-disposition",
        attachment(experiment_name, "results.json"),
      )
      .send(JSON.stringify(results, null, 2));
  }

  @Post(":experiment_id/publish")
  @ApiOperation({
    summary: "Freeze a COMPLETED experiment's results; this is one-way",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({
    status: 409,
    description: "Not COMPLETED, or this metric version is already published",
  })
  async publish(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<
    TypedResponse<Omit<PublishedResultsSummary, "published_by_name">>
  > {
    return {
      data: await this.resultsService.publish(org_id, experiment_id, user),
    };
  }

  @Get(":experiment_id/published")
  @ApiOperation({ summary: "List Published results versions, newest first" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  async listPublished(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<TypedResponse<PublishedResultsSummary[]>> {
    return {
      data: await this.resultsService.listPublished(
        org_id,
        experiment_id,
        user,
      ),
    };
  }

  @Get(":experiment_id/published/:metric_version")
  @ApiOperation({ summary: "Read one stored Published results version" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiParam({ name: "metric_version", description: "Metric version" })
  async getPublished(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Param("metric_version", ParseIntPipe) metric_version: number,
  ): Promise<TypedResponse<ExperimentResults>> {
    return {
      data: await this.resultsService.getPublished(
        org_id,
        experiment_id,
        metric_version,
        user,
      ),
    };
  }

  @Get(":experiment_id/published/:metric_version/package.zip")
  @ApiOperation({
    summary: "Download the replication package of a Published results version",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiParam({ name: "metric_version", description: "Metric version" })
  @ApiProduces(ZIP_CONTENT_TYPE)
  async downloadPublishedPackage(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Param("metric_version", ParseIntPipe) metric_version: number,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { experiment_name, archive } =
      await this.resultsService.getPublishedPackage(
        org_id,
        experiment_id,
        metric_version,
        user,
      );
    await reply
      .header("content-type", ZIP_CONTENT_TYPE)
      .header(
        "content-disposition",
        attachment(experiment_name, `v${metric_version}-package.zip`),
      )
      .send(archive);
  }

  @Get(":experiment_id/figure-catalog")
  @ApiOperation({ summary: "What the Figure composer may offer" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  async getFigureCatalog(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<TypedResponse<FigureCatalog>> {
    return {
      data: await this.figuresService.catalog(org_id, experiment_id, user),
    };
  }

  @Post(":experiment_id/figure-data")
  @HttpCode(200)
  @ApiOperation({ summary: "Compute the data of a Figure definition" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiResponse({ status: 400, description: "Definition outside the catalog" })
  async computeFigureData(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Body() body: FigureDataBody,
  ): Promise<TypedResponse<FigureData>> {
    return {
      data: await this.figuresService.computeData(
        org_id,
        experiment_id,
        body.definition,
        user,
      ),
    };
  }

  @Post(":experiment_id/figures")
  @ApiOperation({ summary: "Save a Figure" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiResponse({ status: 400, description: "Definition outside the catalog" })
  async createFigure(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Body() body: CreateFigureBody,
  ): Promise<CreatedResponse> {
    const id = await this.figuresService.create(
      org_id,
      experiment_id,
      body,
      user,
    );
    return { id };
  }

  @Get(":experiment_id/figures")
  @ApiOperation({ summary: "List the Figures of an experiment" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  async getFigures(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<TypedResponse<FigureSummary[]>> {
    return {
      data: await this.figuresService.list(org_id, experiment_id, user),
    };
  }

  @Get(":experiment_id/figures/:figure_id")
  @ApiOperation({ summary: "Get a saved Figure" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiParam({ name: "figure_id", description: "Figure ID" })
  async getFigure(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Param("figure_id") figure_id: string,
  ): Promise<TypedResponse<FigureSummary>> {
    return {
      data: await this.figuresService.get(
        org_id,
        experiment_id,
        figure_id,
        user,
      ),
    };
  }

  @Patch(":experiment_id/figures/:figure_id")
  @ApiOperation({ summary: "Rename a Figure or change its definition" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiParam({ name: "figure_id", description: "Figure ID" })
  @ApiResponse({ status: 400, description: "Definition outside the catalog" })
  async updateFigure(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Param("figure_id") figure_id: string,
    @Body() body: UpdateFigureBody,
  ): Promise<NoDataResponse> {
    await this.figuresService.update(
      org_id,
      experiment_id,
      figure_id,
      body,
      user,
    );
    return {};
  }

  @Delete(":experiment_id/figures/:figure_id")
  @ApiOperation({ summary: "Delete a Figure" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiParam({ name: "figure_id", description: "Figure ID" })
  async deleteFigure(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
    @Param("figure_id") figure_id: string,
  ): Promise<NoDataResponse> {
    await this.figuresService.delete(org_id, experiment_id, figure_id, user);
    return {};
  }

  @Post(":experiment_id/cancel")
  @ApiOperation({
    summary:
      "Cancel an experiment: stop submitting, let in-flight analyses finish",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 409, description: "Experiment already ended" })
  async cancel(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<NoDataResponse> {
    await this.experimentsService.cancel(org_id, experiment_id, user);
    return {};
  }

  @Delete(":experiment_id")
  @ApiOperation({
    summary: "Delete an experiment, its runs and copied results",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "experiment_id", description: "Experiment ID" })
  @ApiResponse({ status: 409, description: "Experiment has Published results" })
  async delete(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<NoDataResponse> {
    await this.experimentsService.delete(org_id, experiment_id, user);
    return {};
  }
}
