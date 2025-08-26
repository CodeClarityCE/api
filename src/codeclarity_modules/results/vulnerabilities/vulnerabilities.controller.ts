import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { PaginatedResponse, Response } from 'src/types/apiResponses.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { VulnerabilityService } from './vulnerability.service';

@Controller('/org/:org_id/projects/:project_id/analysis')
export class FindingsController {
    constructor(
        private readonly vulnerabilityService: VulnerabilityService,
        private readonly vulnerabilitiesService: VulnerabilitiesService
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
        @Query('search_key') search_key?: string,
        @Query('ecosystem_filter') ecosystem_filter?: string
    ): Promise<PaginatedResponse> {
        return await this.vulnerabilitiesService.getVulnerabilities(
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
            search_key,
            ecosystem_filter
        );
    }

    @Get(':analysis_id/vulnerabilities/stats')
    async getStats(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string,
        @Query('ecosystem_filter') ecosystem_filter?: string
    ): Promise<Response> {
        return {
            data: await this.vulnerabilitiesService.getStats(
                org_id,
                project_id,
                analysis_id,
                user,
                workspace,
                ecosystem_filter
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
            data: await this.vulnerabilityService.getVulnerability(
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
