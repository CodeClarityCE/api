import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";

import {
  KnowledgeStatus,
  KnowledgeStatusService,
} from "./knowledge-status.service";

@ApiTags("Knowledge - Status")
@Controller("knowledge/status")
export class KnowledgeStatusController {
  constructor(private readonly statusService: KnowledgeStatusService) {}

  @Get()
  @ApiOperation({
    summary: "Get the health of each knowledge source",
    description:
      "Returns each knowledge source's watermark, last outcome, row count and whether it is healthy, stale or failed.",
  })
  @ApiResponse({ status: 200, description: "Knowledge source status" })
  async get(
    @AuthUser() _user: AuthenticatedUser,
  ): Promise<TypedResponse<KnowledgeStatus>> {
    return { data: await this.statusService.get() };
  }
}
