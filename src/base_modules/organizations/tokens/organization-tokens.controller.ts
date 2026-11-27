import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { ApiAuthentication } from "src/decorators/ApiAuthDecorator";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { APIDocNoDataResponseDecorator } from "src/decorators/NoDataResponse";
import { APIDocTypedManyResponseDecorator } from "src/decorators/TypedManyResponse";
import { APIDocTypedResponseDecorator } from "src/decorators/TypedResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import { NoDataResponse, TypedResponse } from "src/types/apiResponses.types";
import {
  EntityNotFound,
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "src/types/error.types";

import {
  CreatedOrganizationToken,
  OrganizationTokenCreateBody,
  OrganizationTokenSummary,
} from "./organization-token.types";
import { OrganizationTokensService } from "./organization-tokens.service";

@ApiAuthentication()
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

  @ApiTags("Organization tokens")
  @APIDocTypedManyResponseDecorator(OrganizationTokenSummary)
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @Get("")
  async list(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
  ): Promise<TypedResponse<OrganizationTokenSummary[]>> {
    return { data: await this.tokensService.list(org_id, user) };
  }

  @ApiTags("Organization tokens")
  @APIDocNoDataResponseDecorator()
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @Delete(":token_id")
  async revoke(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("token_id", ParseUUIDPipe) token_id: string,
  ): Promise<NoDataResponse> {
    await this.tokensService.revoke(org_id, token_id, user);
    return {};
  }
}
