import {
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Query
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { NoDataResponse, TypedPaginatedResponse } from 'src/types/apiResponses.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import {
    EntityNotFound,
    InternalError,
    NotAuthenticated,
    NotAuthorized
} from 'src/types/error.types';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { IntegrationsRepository } from './integrations.repository';

@Controller('org/:org_id/integrations')
export class IntegrationsController {
    constructor(
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly integrationsRepository: IntegrationsRepository,
        private readonly integrationsService: IntegrationsService
    ) {}

    @ApiTags('Integrations')
    @APIDocTypedPaginatedResponseDecorator(Integration)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get('/vcs')
    async getManyVCS(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number
    ): Promise<TypedPaginatedResponse<Integration>> {
        return await this.integrationsService.getVCSIntegrations(
            org_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user
        );
    }

    @ApiTags('Integrations')
    @Delete(':integration_id')
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    async unlinkGithub(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('integration_id') integration_id: string
    ): Promise<NoDataResponse> {
        const organization = await this.organizationsRepository.getOrganizationById(org_id, {
            integrations: true
        });
        if (!organization) {
            throw new EntityNotFound();
        }

        await this.integrationsRepository.deleteIntegration(integration_id);
        return {};
    }
}
