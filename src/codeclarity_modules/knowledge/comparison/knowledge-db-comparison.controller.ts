import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";

import {
  KnowledgeDbComparisonService,
  KnowledgeDbSourceComparison,
} from "./knowledge-db-comparison.service";

@ApiTags("Knowledge - Source comparison")
@Controller("knowledge/comparison")
export class KnowledgeDbComparisonController {
  constructor(
    private readonly comparisonService: KnowledgeDbComparisonService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Compare knowledge sources over the whole knowledge database",
    description:
      "Coverage, overlap, severity and affected-version disagreement, and disclosure lag of each knowledge source. Sources that are not healthy are flagged and left out of comparisons.",
  })
  @ApiResponse({ status: 200, description: "Knowledge source comparison" })
  async get(
    @AuthUser() _user: AuthenticatedUser,
  ): Promise<TypedResponse<KnowledgeDbSourceComparison>> {
    return { data: await this.comparisonService.compare() };
  }
}
