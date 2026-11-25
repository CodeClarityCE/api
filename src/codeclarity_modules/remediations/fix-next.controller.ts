import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { OrganizationTokenScope } from "src/base_modules/organizations/tokens/organization-token.types";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { AllowOrganizationToken } from "src/decorators/OrganizationTokenDecorator";
import { APIDocTypedResponseDecorator } from "src/decorators/TypedResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";
import {
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "src/types/error.types";

import { FixNextService } from "./fix-next.service";
import { FixNextEntry, FixNextQuery } from "./fix-next.types";

@Controller("/org/:org_id/remediations/fix-next")
export class FixNextController {
  constructor(private readonly service: FixNextService) {}

  @ApiTags("Remediations")
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @APIDocTypedResponseDecorator(FixNextEntry)
  @AllowOrganizationToken(OrganizationTokenScope.READ)
  @Get()
  async fixNext(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") orgId: string,
    @Query() query: FixNextQuery,
  ): Promise<TypedResponse<FixNextEntry[]>> {
    return { data: await this.service.fixNext(orgId, user, query.limit) };
  }
}
