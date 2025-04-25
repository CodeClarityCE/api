import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { APIDocTypedPaginatedResponseDecorator } from "src/decorators/TypedPaginatedResponse";
import { Result } from "./result.entity";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { AuthUser } from "src/decorators/UserDecorator";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { InternalError, NotAuthenticated, NotAuthorized } from "src/types/error.types";
import { AnalysisResultsService } from "./results.service";
import { Response } from 'src/types/apiResponses.types';

@Controller('/result')
export class ResultsController {

    constructor(
        private readonly resultsService: AnalysisResultsService
    ) { }

    @ApiTags('Results')
    @APIDocTypedPaginatedResponseDecorator(Result)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get('')
    async getResultByType(
        @AuthUser() user: AuthenticatedUser,
        // @Param('org_id') org_id: string,
        @Query('org_id') org_id: string,
        @Query('project_id') project_id: string,
        @Query('analysis_id') analysis_id: string,
        @Query('type') type: string,
    ): Promise<Response> {
        return {
            data: await this.resultsService.getResultByType(
                org_id,
                project_id,
                analysis_id,
                type,
                user
            )
        }
    }
}