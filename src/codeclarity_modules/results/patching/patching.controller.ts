import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { Response } from 'src/types/apiResponses.types';
import { PatchingQueryOptions, PatchingService } from './patching.service';

@Controller('/org/:org_id/projects/:project_id/analysis')
export class PatchingController {
    constructor(private readonly patchingService: PatchingService) {}

    @Get(':analysis_id/patching')
    async getPatches(
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
    ): Promise<Response> {
        const queryOptions: PatchingQueryOptions = {
            workspace,
            page: page ? parseInt(`${page}`) : -1,
            entriesPerPage: entries_per_page ? parseInt(`${entries_per_page}`) : -1,
            sortBy: sort_by,
            sortDirection: sort_direction,
            activeFilters: active_filters,
            searchKey: search_key
        };
        return {
            data: await this.patchingService.getPatches(
                org_id,
                project_id,
                analysis_id,
                user,
                queryOptions
            )
        };
    }

    @Get(':analysis_id/patching/manifest')
    async getPatchedManifest(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string
    ): Promise<Response> {
        return {
            data: await this.patchingService.getPatchedManifest(
                org_id,
                project_id,
                analysis_id,
                user,
                workspace
            )
        };
    }

    @Get(':analysis_id/patching/stats')
    async getStats(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string
    ): Promise<Response> {
        return {
            data: await this.patchingService.getStats(
                org_id,
                project_id,
                analysis_id,
                user,
                workspace
            )
        };
    }

    // @Get(':analysis_id/patching/tree')
    // async getPatchTree(
    //     @Param('org_id') org_id: string,
    //     @Param('project_id') project_id: string,
    //     @Param('analysis_id') analysis_id: string,
    //     @AuthUser() user: AuthenticatedUser,
    //     @Query('workspace') workspace: string
    // ): Promise<Response> {
    //     return {
    //         data: await this.patchingService.getPatchTree(
    //             org_id,
    //             project_id,
    //             analysis_id,
    //             user,
    //             workspace
    //         )
    //     };
    // }
}
