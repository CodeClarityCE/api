import {
    Body,
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    Param,
    ParseBoolPipe,
    ParseIntPipe,
    Patch,
    Post,
    Query
} from '@nestjs/common';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses';
import { GitlabIntegrationService } from './gitlab.service';
import { ApiTags } from '@nestjs/swagger';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
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
    NotAuthorized
} from 'src/types/errors/types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { SortDirection } from 'src/types/sort/types';
import { GitlabRepositoriesService } from './gitlabRepos.service';
import {
    GitlabIntegration,
    GitlabTokenType,
    LinkGitlabCreateBody,
    LinkGitlabPatchBody
} from 'src/types/entities/frontend/GitlabIntegration';
import { Repository } from 'src/types/entities/frontend/Integration';

@Controller('org/:org_id/integrations/gitlab')
export class GitlabIntegrationController {
    constructor(
        private readonly gitlabIntegrationService: GitlabIntegrationService,
        private readonly gitlabReposService: GitlabRepositoriesService
    ) {}

    @ApiTags('Integrations')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [
            IntegrationWrongTokenType,
            IntegrationTokenMissingPermissions,
            IntegrationTokenExpired,
            IntegrationInvalidToken,
            DuplicateIntegration
        ]
    })
    @ApiErrorDecorator({ statusCode: 500, errors: [IntegrationTokenRetrievalFailed] })
    @Post('/add')
    async linkGitlab(
        @Body() linkGitlabCreate: LinkGitlabCreateBody,
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string
    ): Promise<CreatedResponse> {
        linkGitlabCreate.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
        return {
            id: await this.gitlabIntegrationService.addGitlabIntegration(
                org_id,
                linkGitlabCreate,
                user
            )
        };
    }

    @ApiTags('Integrations')
    @Delete(':integration_id')
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    async unlinkGitlab(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string
    ): Promise<NoDataResponse> {
        await this.gitlabIntegrationService.removeGitlabIntegration(org_id, integration_id, user);
        return {};
    }

    @ApiTags('Integrations')
    @Get(':integration_id')
    @APIDocTypedResponseDecorator(GitlabIntegration)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    async getIntegration(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string
    ): Promise<TypedResponse<GitlabIntegration>> {
        return {
            data: await this.gitlabIntegrationService.getGitlabIntegration(
                org_id,
                integration_id,
                user
            )
        };
    }

    @ApiTags('Integrations')
    @Patch(':integration_id')
    async modifyGitlabLink(
        @Body() linkGitlabCreate: LinkGitlabPatchBody,
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string
    ): Promise<NoDataResponse> {
        await this.gitlabIntegrationService.modifyGitlabIntegration(
            org_id,
            integration_id,
            linkGitlabCreate,
            user
        );
        return {};
    }

    @ApiTags('Integrations')
    @APIDocTypedPaginatedResponseDecorator(Repository)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({
        statusCode: 400,
        errors: [
            IntegrationInvalidToken,
            FailedToRetrieveReposFromProvider,
            IntegrationTokenMissingPermissions,
            IntegrationTokenExpired,
            IntegrationTokenRetrievalFailed
        ]
    })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':integration_id/repositories')
    async getRepositories(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('force_refresh', new DefaultValuePipe(false), ParseBoolPipe) force_refresh?: boolean,
        @Query('active_filters') active_filters?: string,
        @Query('sort_key') sort_key?: string,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<Repository>> {
        return await this.gitlabReposService.getGitlabRepositories(
            org_id,
            integration_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user,
            search_key,
            force_refresh,
            active_filters ? active_filters.replace('[', '').replace(']', '').split(',') : [],
            sort_key,
            sort_direction
        );
    }
}
