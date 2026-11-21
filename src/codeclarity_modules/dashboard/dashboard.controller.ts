import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  CIAImpact,
  GetOverallCIADistQueryOptions,
  GetOverallLicenseDistQueryOptions,
} from "src/codeclarity_modules/dashboard/dashboard.types";
import { LicenseDist } from "src/codeclarity_modules/results/sbom/sbom.types";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { APIDocTypedManyResponseDecorator } from "src/decorators/TypedManyResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";
import {
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "src/types/error.types";

import { DashboardService } from "./dashboard.service";

@Controller("/org/:org_id/dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiTags("Dashboard")
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @APIDocTypedManyResponseDecorator(CIAImpact)
  @Get("overall_cia_impact")
  async getOverallCIAImpact(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") orgId: string,
    // Accepted for older clients; the current analyses need no period.
    @Query() _queryParams: GetOverallCIADistQueryOptions,
  ): Promise<TypedResponse<CIAImpact[]>> {
    return {
      data: await this.dashboardService.getOverallCIAImpact(orgId, user),
    };
  }

  @ApiTags("Dashboard")
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  // @APIDocTypedManyResponseDecorator(LicenseDist)
  @Get("overall_license_dist")
  async getOverallLicenseDist(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") orgId: string,
    @Query() queryParams: GetOverallLicenseDistQueryOptions,
  ): Promise<TypedResponse<LicenseDist>> {
    return {
      data: await this.dashboardService.getOverallLicenseDist(
        orgId,
        user,
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
      ),
    };
  }
}
