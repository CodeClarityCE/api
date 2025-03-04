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
import { AuthenticatedUser } from 'src/types/auth/types';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses';
import { GithubIntegrationService } from './github.service';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
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
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { SortDirection } from 'src/types/sort/types';
import { GithubRepositoriesService } from './githubRepos.service';
import {
    GithubTokenType,
    LinkGithubCreateBody,
    LinkGithubPatchBody
} from 'src/types/entities/frontend/GithubIntegration';
import { Integration } from 'src/entity/codeclarity/Integration';
import { Organization } from 'src/entity/codeclarity/Organization';
import { RepositoryCache } from 'src/entity/codeclarity/RepositoryCache';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Controller('org/:org_id/integrations/github')
export class GithubIntegrationController {
    constructor(
        private readonly githubIntegrationService: GithubIntegrationService,
        private readonly githubReposService: GithubRepositoriesService,
        @InjectRepository(Organization, 'codeclarity')
        private organizationRepository: Repository<Organization>,
        @InjectRepository(Integration, 'codeclarity')
        private integrationRepository: Repository<Integration>
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
    async linkGithub(
        @Body() linkGithubCreate: LinkGithubCreateBody,
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string
    ): Promise<CreatedResponse> {
        linkGithubCreate.token_type = GithubTokenType.CLASSIC_TOKEN;
        return {
            id: await this.githubIntegrationService.addGithubIntegration(
                org_id,
                linkGithubCreate,
                user
            )
        };
    }

    @ApiTags('Integrations')
    @Get(':integration_id')
    @APIDocTypedResponseDecorator(Integration)
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    async getIntegration(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string
    ): Promise<TypedResponse<Integration>> {
        return {
            data: await this.githubIntegrationService.getGithubIntegration(
                org_id,
                integration_id,
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
    async unlinkGithub(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string
    ): Promise<NoDataResponse> {
        const organization = await this.organizationRepository.findOne({
            where: { id: org_id },
            relations: ['integrations']
        });
        if (!organization) {
            throw new EntityNotFound();
        }
        organization.integrations = organization.integrations?.filter(
            (integration) => integration.id !== integration_id
        );

        await this.organizationRepository.save(organization);

        await this.integrationRepository.delete(integration_id);
        return {};
    }

    @ApiTags('Integrations')
    @Patch(':integration_id')
    async modifyGithubLink(
        @Body() linkGithubCreate: LinkGithubPatchBody,
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string
    ): Promise<NoDataResponse> {
        await this.githubIntegrationService.modifyGithubIntegration(
            org_id,
            integration_id,
            linkGithubCreate,
            user
        );
        return {};
    }

    @ApiTags('Integrations')
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
    ): Promise<TypedPaginatedResponse<RepositoryCache>> {
        return await this.githubReposService.getGithubRepositories(
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
