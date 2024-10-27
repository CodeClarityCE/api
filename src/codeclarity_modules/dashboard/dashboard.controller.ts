import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from 'src/types/auth/types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { TypedPaginatedResponse, TypedResponse } from 'src/types/apiResponses';
import {
    AttackVectorDist,
    CIAImpact,
    GetOverallAttackVectorDistQueryOptions,
    GetOverallCIADistQueryOptions,
    GetOverallLicenseDistQueryOptions,
    GetProjectsQuickStatsQueryOptions,
    GetQuickStatsQueryOptions,
    GetRecentVulnsQueryOptions,
    GetWeeklySeverityInfoQueryOptions,
    LatestVulns,
    ProjectQuickStats,
    QuickStats,
    SeverityInfoByWeek
} from 'src/types/entities/frontend/Dashboard';
import { APIDocTypedManyResponseDecorator } from 'src/decorators/TypedManyResponse';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { InternalError, NotAuthenticated, NotAuthorized } from 'src/types/errors/types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import { LicenseDist } from 'src/types/entities/services/Sbom';

@Controller('/org/:org_id/dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) {}

    @ApiTags('Dashboard')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @APIDocTypedManyResponseDecorator(SeverityInfoByWeek)
    @Get('weekly_severity_info')
    async getWeeklySeverityInfo(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') orgId: string,
        @Query() queryParams: GetWeeklySeverityInfoQueryOptions
    ): Promise<TypedResponse<SeverityInfoByWeek[]>> {
        return {
            data: await this.dashboardService.getWeeklySeverityInfo(
                orgId,
                user,
                queryParams.startDate,
                queryParams.endDate,
                queryParams.integrationIds
            )
        };
    }

    @ApiTags('Dashboard')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @APIDocTypedManyResponseDecorator(AttackVectorDist)
    @Get('overall_av_dist')
    async getOverallAttackVectorDist(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') orgId: string,
        @Query() queryParams: GetOverallAttackVectorDistQueryOptions
    ): Promise<TypedResponse<AttackVectorDist[]>> {
        return {
            data: await this.dashboardService.getOverallAttackVectorDist(
                orgId,
                user,
                queryParams.startDate,
                queryParams.endDate,
                queryParams.integrationIds
            )
        };
    }

    @ApiTags('Dashboard')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @APIDocTypedManyResponseDecorator(CIAImpact)
    @Get('overall_cia_impact')
    async getOverallCIAImpact(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') orgId: string,
        @Query() queryParams: GetOverallCIADistQueryOptions
    ): Promise<TypedResponse<CIAImpact[]>> {
        return {
            data: await this.dashboardService.getOverallCIAImpact(
                orgId,
                user,
                queryParams.startDate,
                queryParams.endDate,
                queryParams.integrationIds
            )
        };
    }

    @ApiTags('Dashboard')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    // @APIDocTypedManyResponseDecorator(LicenseDist)
    @Get('overall_license_dist')
    async getOverallLicenseDist(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') orgId: string,
        @Query() queryParams: GetOverallLicenseDistQueryOptions
    ): Promise<TypedResponse<LicenseDist>> {
        return {
            data: await this.dashboardService.getOverallLicenseDist(
                orgId,
                user,
                queryParams.startDate,
                queryParams.endDate,
                queryParams.integrationIds
            )
        };
    }

    @ApiTags('Dashboard')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @APIDocTypedResponseDecorator(LatestVulns)
    @Get('recent_vulns')
    async getRecentVuls(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') orgId: string,
        @Query() queryParams: GetRecentVulnsQueryOptions
    ): Promise<TypedResponse<LatestVulns>> {
        return {
            data: await this.dashboardService.getRecentVuls(
                orgId,
                user,
                queryParams.startDate,
                queryParams.endDate,
                queryParams.integrationIds
            )
        };
    }

    @ApiTags('Dashboard')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @APIDocTypedResponseDecorator(QuickStats)
    @Get('quick_stats')
    async getQuickStats(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') orgId: string,
        @Query() queryParams: GetQuickStatsQueryOptions
    ): Promise<TypedResponse<QuickStats>> {
        return {
            data: await this.dashboardService.getQuickStats(
                orgId,
                user,
                queryParams.startDate,
                queryParams.endDate,
                queryParams.integrationIds
            )
        };
    }

    @ApiTags('Dashboard')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @APIDocTypedPaginatedResponseDecorator(ProjectQuickStats)
    @Get('project_quick_stats')
    async getProjectsQuickStats(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') orgId: string,
        @Query() queryParams: GetProjectsQuickStatsQueryOptions
    ): Promise<TypedPaginatedResponse<ProjectQuickStats>> {
        return await this.dashboardService.getProjectsQuickStats(
            orgId,
            user,
            { currentPage: queryParams.page, entriesPerPage: queryParams.entries_per_page },
            queryParams.startDate,
            queryParams.endDate,
            queryParams.integrationIds,
            queryParams.sort_key,
            queryParams.sort_direction
        );
    }
}
