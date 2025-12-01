import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { PaginatedResponse, Response } from 'src/types/apiResponses.types';
import { SbomQueryOptions, SBOMService } from './sbom.service';

@Controller('/org/:org_id/projects/:project_id/analysis')
export class SBOMController {
    constructor(private readonly sbomService: SBOMService) {}

    @Get(':analysis_id/sbom')
    async getSbom(
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
        const queryOptions: SbomQueryOptions = {
            workspace,
            page: page ? parseInt(`${page}`) : -1,
            entriesPerPage: entries_per_page ? parseInt(`${entries_per_page}`) : -1,
            sortBy: sort_by,
            sortDirection: sort_direction,
            activeFilters: active_filters,
            searchKey: search_key,
            ecosystemFilter: ecosystem_filter
        };
        return await this.sbomService.getSbom(org_id, project_id, analysis_id, user, queryOptions);
    }

    @Get(':analysis_id/sbom/stats')
    async getStats(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string,
        @Query('ecosystem_filter') ecosystem_filter?: string,
        @Query('run_index') _run_index?: string
    ): Promise<Response> {
        return {
            data: await this.sbomService.getStats(
                org_id,
                project_id,
                analysis_id,
                workspace,
                user,
                ecosystem_filter
            )
        };
    }

    @Get(':analysis_id/sbom/workspaces')
    async getWorkspaces(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser
    ): Promise<Response> {
        return {
            data: await this.sbomService.getWorkspaces(org_id, project_id, analysis_id, user)
        };
    }

    @Get(':analysis_id/sbom/dependency')
    async getDependency(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string,
        @Query('dependency') dependency: string
    ): Promise<Response> {
        const data = await this.sbomService.getDependency(
            org_id,
            project_id,
            analysis_id,
            workspace,
            dependency,
            user
        );
        return {
            data: data
        };
    }

    @Get(':analysis_id/sbom/dependency/graph')
    async getDependencyGraph(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('dependency') dependency: string,
        @Query('workspace') workspace: string
    ): Promise<Response> {
        return {
            data: await this.sbomService.getDependencyGraph(
                org_id,
                project_id,
                analysis_id,
                workspace,
                dependency,
                user
            )
        };
    }
}
