import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { FindingsService } from './vulnerabilities.service';
import { PaginatedResponse, Response } from 'src/types/apiResponses.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { FindingService } from './vulnerability.service';

@Controller('/org/:org_id/projects/:project_id/analysis')
export class FindingsController {
    constructor(
        private readonly findingService: FindingService,
        private readonly findingsService: FindingsService
    ) {}

    @Get(':analysis_id/vulnerabilities')
    async getVulnerabilities(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('sort_by') sort_by?: string,
        @Query('sort_direction') sort_direction?: string,
        @Query('active_filters') active_filters?: string,
        @Query('search_key') search_key?: string
    ): Promise<PaginatedResponse> {
        return await this.findingsService.getVulnerabilities(
            org_id,
            project_id,
            analysis_id,
            user,
            workspace,
            page ? parseInt(page + '') : -1,
            entries_per_page ? parseInt(entries_per_page + '') : -1,
            sort_by,
            sort_direction,
            active_filters,
            search_key
        );
    }

    @Get(':analysis_id/vulnerabilities/stats')
    async getStats(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string
    ): Promise<Response> {
        return {
            data: await this.findingsService.getStats(
                org_id,
                project_id,
                analysis_id,
                user,
                workspace
            )
        };
    }

    @Get(':analysis_id/vulnerabilities/vulnerability/:vulnerability_id')
    async getVulnerability(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @Param('vulnerability_id') vulnerability_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string
    ): Promise<Response> {
        return {
            data: await this.findingService.getVulnerability(
                org_id,
                project_id,
                analysis_id,
                user,
                vulnerability_id,
                workspace
            )
        };
    }
}
