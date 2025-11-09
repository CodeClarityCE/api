import {
    Controller,
    Get,
    Post,
    Put,
    Param,
    Delete,
    Body,
    Query,
    ParseIntPipe,
    DefaultValuePipe
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { AnalysisCreateBody, AnalysisRun, ScheduleUpdateBody } from 'src/base_modules/analyses/analysis.types';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { AuthUser } from 'src/decorators/UserDecorator';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses.types';
import { EntityNotFound, NotAuthorized } from 'src/types/error.types';
import {
    AnalyzerDoesNotExist,
    AnaylzerMissingConfigAttribute
} from '../analyzers/analyzers.errors';
import { AnalysesService } from './analyses.service';

@ApiBearerAuth()
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
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page = 0,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page = 0
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
    ): Promise<TypedResponse<object[]>> {
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

    // ===== SCHEDULING ENDPOINTS =====
    // These endpoints manage recurring analysis execution

    /**
     * Get all active scheduled analyses for a project
     * Returns analyses with schedule_type of 'daily' or 'weekly' that are currently active
     *
     * @example GET /org/123/projects/456/analyses/scheduled
     * @returns Array of Analysis objects with scheduling information
     */
    @ApiTags('Analyses')
    @ApiOperation({
        description: 'Get all scheduled analyses for a project',
        summary: 'Retrieve active recurring analyses (daily/weekly) for a project'
    })
    @APIDocTypedResponseDecorator(Analysis)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @Get('scheduled')
    async getScheduled(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string
    ): Promise<TypedResponse<Analysis[]>> {
        const analyses = await this.analysesService.getScheduledAnalyses(org_id, project_id, user);
        return { data: analyses };
    }

    /**
     * Update the schedule configuration for an existing analysis
     * Can change schedule type, next run time, and active status
     *
     * @example PUT /org/123/projects/456/analyses/789/schedule
     * Body: { "schedule_type": "daily", "next_scheduled_run": "2024-01-15T10:00:00Z", "is_active": true }
     */
    @ApiTags('Analyses')
    @ApiOperation({
        description: 'Update schedule for an existing analysis',
        summary: 'Modify scheduling configuration (frequency, timing, active status)'
    })
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @Put(':analysis_id/schedule')
    async updateSchedule(
        @AuthUser() user: AuthenticatedUser,
        @Body() scheduleData: ScheduleUpdateBody,
        @Param('analysis_id') analysis_id: string,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string
    ): Promise<NoDataResponse> {
        await this.analysesService.updateSchedule(
            org_id,
            project_id,
            analysis_id,
            scheduleData,
            user
        );
        return {};
    }

    /**
     * Cancel/disable a scheduled analysis
     * Sets is_active to false, preventing future scheduled executions
     *
     * @example DELETE /org/123/projects/456/analyses/789/schedule
     */
    @ApiTags('Analyses')
    @ApiOperation({
        description: 'Cancel scheduled analysis',
        summary: 'Disable recurring execution by setting is_active to false'
    })
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @Delete(':analysis_id/schedule')
    async cancelSchedule(
        @AuthUser() user: AuthenticatedUser,
        @Param('analysis_id') analysis_id: string,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string
    ): Promise<NoDataResponse> {
        await this.analysesService.cancelSchedule(org_id, project_id, analysis_id, user);
        return {};
    }

    // ===== INTERNAL SCHEDULER ENDPOINTS =====
    // These endpoints are used by the scheduler service to manage scheduled executions

    /**
     * Create a new analysis execution for scheduled analysis
     * This endpoint duplicates an existing scheduled analysis to create a new execution record
     * Used internally by the scheduler service to preserve historical results
     *
     * @example POST /org/123/projects/456/analyses/789/execute
     * @returns { id: "new-analysis-uuid" }
     * @internal This endpoint is intended for use by the scheduler service only
     */
    @ApiTags('Analyses')
    @ApiOperation({
        description: 'Create new execution for scheduled analysis (internal use)',
        summary: 'Duplicate scheduled analysis for new execution - preserves historical results'
    })
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @Post(':analysis_id/execute')
    async createScheduledExecution(
        @Param('analysis_id') analysis_id: string
    ): Promise<CreatedResponse> {
        const newAnalysisId = await this.analysesService.createScheduledExecution(analysis_id);
        return { id: newAnalysisId };
    }

    // ===== ANALYSIS HISTORY ENDPOINTS =====

    /**
     * Get execution history/runs for a specific analysis
     * Returns grouped results showing when the analysis was executed and what results were produced
     * Results are grouped by day to show execution history over time
     *
     * @example GET /org/123/projects/456/analyses/789/runs
     * @returns Array of run objects with: { run_date, result_count, plugins, plugin_count }
     */
    @ApiTags('Analyses')
    @ApiOperation({
        description: 'Get analysis execution history',
        summary:
            'Retrieve historical runs showing when analysis executed and what results were generated'
    })
    @APIDocTypedResponseDecorator(Array)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @Get(':analysis_id/runs')
    async getAnalysisRuns(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser
    ): Promise<TypedResponse<AnalysisRun[]>> {
        const runs = await this.analysesService.getAnalysisRuns(
            org_id,
            project_id,
            analysis_id,
            user
        );
        return {
            data: runs
        };
    }
}
