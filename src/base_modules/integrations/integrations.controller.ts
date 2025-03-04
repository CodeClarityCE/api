import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { TypedPaginatedResponse } from 'src/types/apiResponses';
import { AuthUser } from 'src/decorators/UserDecorator';
import { AuthenticatedUser } from 'src/types/auth/types';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { InternalError, NotAuthenticated } from 'src/types/errors/types';
import { Integration } from 'src/entity/codeclarity/Integration';

@Controller('org/:org_id/integrations')
export class IntegrationsController {
    constructor(private readonly integrationsService: IntegrationsService) {}

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
}
