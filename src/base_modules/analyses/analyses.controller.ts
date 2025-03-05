import {
    Controller,
    Get,
    Post,
    Param,
    Delete,
    Body,
    Query,
    ParseIntPipe,
    DefaultValuePipe
} from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses';
import { AnalysisCreateBody } from 'src/types/entities/frontend/Analysis';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/types/auth/types';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import {
    AnalyzerDoesNotExist,
    AnaylzerMissingConfigAttribute,
    EntityNotFound,
    NotAuthorized
} from 'src/types/errors/types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';

@Controller('/org/:org_id/projects/:project_id/analyses')
export class AnalysesController {
    constructor(private readonly analysesService: AnalysesService) {}

    @ApiTags('Analyses')
    @ApiOperation({ description: 'Start an analysis on the project.' })
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [AnalyzerDoesNotExist, AnaylzerMissingConfigAttribute]
    })
    @Post('')
    async create(
        @AuthUser() user: AuthenticatedUser,
        @Body() analysis: AnalysisCreateBody,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string
    ): Promise<CreatedResponse> {
        return { id: await this.analysesService.create(org_id, project_id, analysis, user) };
    }

    @ApiTags('Analyses')
    @ApiOperation({ description: 'Get the analyses of a project.' })
    @APIDocTypedPaginatedResponseDecorator(Analysis)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number
    ): Promise<TypedPaginatedResponse<Analysis>> {
        return await this.analysesService.getMany(
            org_id,
            project_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user
        );
    }

    @ApiTags('Analyses')
    @ApiOperation({ description: 'Get a particular analyses of a project.' })
    @APIDocTypedResponseDecorator(Analysis)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @Get(':analysis_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('analysis_id') analysis_id: string,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string
    ): Promise<TypedResponse<Analysis>> {
        return { data: await this.analysesService.get(org_id, project_id, analysis_id, user) };
    }

    @ApiTags('Analyses')
    @ApiOperation({ description: 'Get data to create a chart.' })
    @APIDocTypedResponseDecorator(Analysis)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @Get(':analysis_id/chart')
    async getChart(
        @AuthUser() user: AuthenticatedUser,
        @Param('analysis_id') analysis_id: string,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string
    ): Promise<TypedResponse<Array<object>>> {
        return { data: await this.analysesService.getChart(org_id, project_id, analysis_id, user) };
    }

    @ApiTags('Analyses')
    @ApiOperation({ description: 'Remove a particular analyses of a project.' })
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @Delete(':analysis_id')
    async delete(
        @AuthUser() user: AuthenticatedUser,
        @Param('analysis_id') analysis_id: string,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string
    ): Promise<NoDataResponse> {
        await this.analysesService.delete(org_id, project_id, analysis_id, user);
        return {};
    }
}
