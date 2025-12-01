import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { DepShortInfo } from 'src/codeclarity_modules/results/licenses/licenses2.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { PaginatedResponse } from 'src/types/apiResponses.types';
import { LicensesQueryOptions, LicensesService } from './licenses.service';

@Controller('/org/:org_id/projects/:project_id/analysis')
export class LicensesController {
    constructor(private readonly licensesService: LicensesService) {}

    @Get(':analysis_id/licenses')
    async getLicensesUsed(
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
        const queryOptions: LicensesQueryOptions = {
            workspace,
            page: page ? parseInt(`${page}`) : -1,
            entriesPerPage: entries_per_page ? parseInt(`${entries_per_page}`) : -1,
            sortBy: sort_by,
            sortDirection: sort_direction,
            activeFilters: active_filters,
            searchKey: search_key,
            ecosystemFilter: ecosystem_filter
        };
        return await this.licensesService.getLicensesUsed(
            org_id,
            project_id,
            analysis_id,
            user,
            queryOptions
        );
    }

    @Get(':analysis_id/licenses/:license_id/dependencies')
    async getDepsInfo(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @Param('license_id') license_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string
    ): Promise<Record<string, DepShortInfo>> {
        return await this.licensesService.getDependenciesUsingLicense(
            org_id,
            project_id,
            analysis_id,
            user,
            workspace,
            license_id
        );
    }
}
