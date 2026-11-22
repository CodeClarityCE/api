import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { APIDocTypedResponseDecorator } from "src/decorators/TypedResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";
import {
  EntityNotFound,
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "src/types/error.types";

import {
  CreatedOrganizationToken,
  OrganizationTokenCreateBody,
} from "./organization-token.types";
import { OrganizationTokensService } from "./organization-tokens.service";

@ApiBearerAuth()
@Controller("org/:org_id/tokens")
export class OrganizationTokensController {
  constructor(private readonly tokensService: OrganizationTokensService) {}

  @ApiTags("Organization tokens")
  @APIDocTypedResponseDecorator(CreatedOrganizationToken)
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @Post("")
  async create(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Body() body: OrganizationTokenCreateBody,
  ): Promise<TypedResponse<CreatedOrganizationToken>> {
    return { data: await this.tokensService.create(org_id, body, user) };
  }
}
