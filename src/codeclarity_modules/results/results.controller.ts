import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { APIDocTypedPaginatedResponseDecorator } from "src/decorators/TypedPaginatedResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import { Response } from "src/types/apiResponses.types";
import {
  InternalError,
  NotAuthenticated,
  NotAuthorized,
  ValidationFailed,
} from "src/types/error.types";

import { Result } from "./result.entity";
import { ResultByTypeQuery } from "./results.dto";
import { AnalysisResultsService } from "./results.service";

@Controller("/result")
export class ResultsController {
  constructor(private readonly resultsService: AnalysisResultsService) {}

  @ApiTags("Results")
  @APIDocTypedPaginatedResponseDecorator(Result)
  @ApiErrorDecorator({ statusCode: 400, errors: [ValidationFailed] })
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @Get("")
  async getResultByType(
    @AuthUser() user: AuthenticatedUser,
    @Query() query: ResultByTypeQuery,
  ): Promise<Response> {
    return {
      data: await this.resultsService.getResultByType(
        query.org_id,
        query.project_id,
        query.analysis_id,
        query.type,
        user,
      ),
    };
  }
}
