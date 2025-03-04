import { Controller, Get, Param } from '@nestjs/common';
import { AuthUser } from 'src/decorators/UserDecorator';
import { PluginService } from './plugin.service';
import { AuthenticatedUser } from 'src/types/auth/types';
import { TypedResponse } from 'src/types/apiResponses';
import { ApiTags } from '@nestjs/swagger';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { InternalError, NotAuthenticated } from 'src/types/errors/types';
import { Plugin } from 'src/entity/plugin/Plugin';

@Controller('plugin')
export class PluginController {
    constructor(private readonly pluginService: PluginService) {}

    @ApiTags('Plugin')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':plugin_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('plugin_id') plugin_id: string
    ): Promise<TypedResponse<Plugin>> {
        return { data: await this.pluginService.get(plugin_id) };
    }

    @ApiTags('Plugin')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get()
    async getAll(@AuthUser() user: AuthenticatedUser): Promise<TypedResponse<Array<Plugin>>> {
        return { data: await this.pluginService.getAll() };
    }
}
