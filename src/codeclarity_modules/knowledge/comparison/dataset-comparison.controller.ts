import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";

import {
  DatasetComparisonService,
  DatasetSourceComparison,
} from "./dataset-comparison.service";

@ApiTags("Knowledge - Source comparison")
@Controller("knowledge/comparison")
export class DatasetComparisonController {
  constructor(private readonly comparisonService: DatasetComparisonService) {}

  @Get()
  @ApiOperation({
    summary: "Compare knowledge sources over the whole knowledge database",
    description:
      "Coverage, overlap, severity and affected-version disagreement, and disclosure lag of each knowledge source. Sources that are not healthy are flagged and left out of comparisons.",
  })
  @ApiResponse({ status: 200, description: "Knowledge source comparison" })
  async get(
    @AuthUser() _user: AuthenticatedUser,
  ): Promise<TypedResponse<DatasetSourceComparison>> {
    return { data: await this.comparisonService.compare() };
  }
}
