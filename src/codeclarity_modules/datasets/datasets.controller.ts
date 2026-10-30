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

import { DatasetsService } from "./datasets.service";
import {
  CreateDatasetBody,
  DatasetEntrySummary,
  DatasetSummary,
} from "./datasets.types";

@ApiTags("Datasets")
@Controller("org/:org_id/datasets")
export class DatasetsController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Post("")
  @ApiOperation({
    summary: "Build a dataset of the most-starred GitHub repositories",
  })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiResponse({ status: 201, description: "Dataset registered, building" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 409, description: "Name already used in the org" })
  async create(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Body() body: CreateDatasetBody,
  ): Promise<CreatedResponse> {
    const id = await this.datasetsService.create(org_id, body, user);
    return { id };
  }

  @Get("")
  @ApiOperation({ summary: "List the datasets of an organization" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "entries_per_page", required: false })
  async getMany(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Query("page", new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query("entries_per_page", new DefaultValuePipe(20), ParseIntPipe)
    entries_per_page: number,
  ): Promise<TypedPaginatedResponse<DatasetSummary>> {
    return this.datasetsService.getMany(
      org_id,
      { currentPage: page, entriesPerPage: entries_per_page },
      user,
    );
  }

  @Get(":dataset_id")
  @ApiOperation({ summary: "Get a dataset with its build status and stats" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "dataset_id", description: "Dataset ID" })
  async get(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("dataset_id") dataset_id: string,
  ): Promise<TypedResponse<DatasetSummary>> {
    return {
      data: await this.datasetsService.get(org_id, dataset_id, user),
    };
  }

  @Get(":dataset_id/entries")
  @ApiOperation({ summary: "List the repositories of a dataset by rank" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "dataset_id", description: "Dataset ID" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "entries_per_page", required: false })
  async getEntries(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("dataset_id") dataset_id: string,
    @Query("page", new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query("entries_per_page", new DefaultValuePipe(100), ParseIntPipe)
    entries_per_page: number,
  ): Promise<TypedPaginatedResponse<DatasetEntrySummary>> {
    return this.datasetsService.getEntries(
      org_id,
      dataset_id,
      { currentPage: page, entriesPerPage: entries_per_page },
      user,
    );
  }

  @Delete(":dataset_id")
  @ApiOperation({ summary: "Delete a dataset (cancels a running build)" })
  @ApiParam({ name: "org_id", description: "Organization ID" })
  @ApiParam({ name: "dataset_id", description: "Dataset ID" })
  async delete(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("dataset_id") dataset_id: string,
  ): Promise<NoDataResponse> {
    await this.datasetsService.delete(org_id, dataset_id, user);
    return {};
  }
}
