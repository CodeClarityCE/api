import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  GithubTokenType,
  LinkGithubCreateBody,
  LinkGithubPatchBody,
} from "src/base_modules/integrations/github/githubIntegration.types";
import { Integration } from "src/base_modules/integrations/integrations.entity";
import { RepositoryCache } from "src/base_modules/projects/repositoryCache.entity";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { APIDocCreatedResponseDecorator } from "src/decorators/CrudResponse";
import { APIDocTypedResponseDecorator } from "src/decorators/TypedResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  CreatedResponse,
  NoDataResponse,
  TypedPaginatedResponse,
  TypedResponse,
} from "src/types/apiResponses.types";
import {
  DuplicateIntegration,
  EntityNotFound,
  FailedToRetrieveReposFromProvider,
  IntegrationInvalidToken,
  IntegrationTokenExpired,
  IntegrationTokenMissingPermissions,
  IntegrationTokenRetrievalFailed,
  IntegrationWrongTokenType,
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "src/types/error.types";
import { SortDirection } from "src/types/sort.types";
import { GithubIntegrationService } from "./github.service";
import { GithubRepositoriesService } from "./githubRepos.service";

@Controller("org/:org_id/integrations/github")
export class GithubIntegrationController {
  constructor(
    private readonly githubIntegrationService: GithubIntegrationService,
    private readonly githubReposService: GithubRepositoriesService,
  ) {}

  @ApiTags("Integrations")
  @APIDocCreatedResponseDecorator()
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({
    statusCode: 400,
    errors: [
      IntegrationWrongTokenType,
      IntegrationTokenMissingPermissions,
      IntegrationTokenExpired,
      IntegrationInvalidToken,
      DuplicateIntegration,
    ],
  })
  @ApiErrorDecorator({
    statusCode: 500,
    errors: [IntegrationTokenRetrievalFailed],
  })
  @Post("/add")
  async linkGithub(
    @Body() linkGithubCreate: LinkGithubCreateBody,
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
  ): Promise<CreatedResponse> {
    linkGithubCreate.token_type = GithubTokenType.CLASSIC_TOKEN;
    return {
      id: await this.githubIntegrationService.addGithubIntegration(
        org_id,
        linkGithubCreate,
        user,
      ),
    };
  }

  @ApiTags("Integrations")
  @Get(":integration_id")
  @APIDocTypedResponseDecorator(Integration)
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  async getIntegration(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("integration_id") integration_id: string,
  ): Promise<TypedResponse<Integration>> {
    return {
      data: await this.githubIntegrationService.getGithubIntegration(
        org_id,
        integration_id,
        user,
      ),
    };
  }

  @ApiTags("Integrations")
  @Patch(":integration_id")
  async modifyGithubLink(
    @Body() linkGithubCreate: LinkGithubPatchBody,
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("integration_id") integration_id: string,
  ): Promise<NoDataResponse> {
    await this.githubIntegrationService.modifyGithubIntegration(
      org_id,
      integration_id,
      linkGithubCreate,
      user,
    );
    return {};
  }

  @ApiTags("Integrations")
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
  @ApiErrorDecorator({
    statusCode: 400,
    errors: [
      IntegrationInvalidToken,
      FailedToRetrieveReposFromProvider,
      IntegrationTokenMissingPermissions,
      IntegrationTokenExpired,
      IntegrationTokenRetrievalFailed,
    ],
  })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @Get(":integration_id/repositories")
  async getRepositories(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("integration_id") integration_id: string,
    @Query("page", new DefaultValuePipe(0), ParseIntPipe) page?: number,
    @Query("entries_per_page", new DefaultValuePipe(0), ParseIntPipe)
    entries_per_page?: number,
    @Query("search_key") search_key?: string,
    @Query("force_refresh", new DefaultValuePipe(false), ParseBoolPipe)
    force_refresh?: boolean,
    @Query("active_filters") active_filters?: string,
    @Query("sort_key") sort_key?: string,
    @Query("sort_direction") sort_direction?: SortDirection,
  ): Promise<TypedPaginatedResponse<RepositoryCache>> {
    return await this.githubReposService.getGithubRepositories(
      org_id,
      integration_id,
      { currentPage: page, entriesPerPage: entries_per_page },
      user,
      search_key,
      force_refresh,
      active_filters
        ? active_filters.replace("[", "").replace("]", "").split(",")
        : [],
      sort_key,
      sort_direction,
    );
  }
}
