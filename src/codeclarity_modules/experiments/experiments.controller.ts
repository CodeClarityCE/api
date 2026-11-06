import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  CreatedResponse,
  NoDataResponse,
  TypedPaginatedResponse,
  TypedResponse,
} from "src/types/apiResponses.types";

import type { ExperimentResults } from "./experiment-results";
import { ExperimentsService } from "./experiments.service";
import {
  CreateExperimentBody,
  ExperimentRunSummary,
  ExperimentSummary,
} from "./experiments.types";

@ApiTags("Experiments")
@Controller("org/:org_id/experiments")
export class ExperimentsController {
  constructor(private readonly experimentsService: ExperimentsService) {}

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
      data: await this.experimentsService.getResults(
        org_id,
        experiment_id,
        user,
      ),
    };
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
  async delete(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("experiment_id") experiment_id: string,
  ): Promise<NoDataResponse> {
    await this.experimentsService.delete(org_id, experiment_id, user);
    return {};
  }
}
