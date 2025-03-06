import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { SBOMService } from './sbom.service';
import { PaginatedResponse, Response } from 'src/types/apiResponses';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { WorkspacesOutput } from 'src/types/entities/services/Sbom';

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
        @Query('search_key') search_key?: string
    ): Promise<PaginatedResponse> {
        const sbom = await this.sbomService.getSbom(
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
        return sbom;
    }

    @Get(':analysis_id/sbom/stats')
    async getStats(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser,
        @Query('workspace') workspace: string
    ): Promise<Response> {
        return {
            data: await this.sbomService.getStats(org_id, project_id, analysis_id, workspace, user)
        };
    }

    // @Get(':analysis_id/sbom/graph')
    // async getGraph(
    //     @Param('org_id') org_id: string,
    //     @Param('project_id') project_id: string,
    //     @Param('analysis_id') analysis_id: string,
    //     @AuthUser() user: AuthenticatedUser,
    //     @Query('workspace') workspace: string
    // ): Promise<Response> {
    //     return {
    //         data: await this.sbomService.getGraph(org_id, project_id, analysis_id, workspace, user)
    //     };
    // }

    @Get(':analysis_id/sbom/workspaces')
    async getWorkspaces(
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Param('analysis_id') analysis_id: string,
        @AuthUser() user: AuthenticatedUser
    ): Promise<WorkspacesOutput> {
        return await this.sbomService.getWorkspaces(org_id, project_id, analysis_id, user);
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
        )
        return {
            data: data
        };
    }

    // @Get(':analysis_id/sbom/dependency/graph')
    // async getDependencyGraph(
    //     @Param('org_id') org_id: string,
    //     @Param('project_id') project_id: string,
    //     @Param('analysis_id') analysis_id: string,
    //     @AuthUser() user: AuthenticatedUser,
    //     @Query('dependency') dependency: string,
    //     @Query('workspace') workspace: string
    // ): Promise<Response> {
    //     return {
    //         data: await this.sbomService.getDependencyGraph(
    //             org_id,
    //             project_id,
    //             analysis_id,
    //             workspace,
    //             dependency,
    //             user
    //         )
    //     };
    // }
}
