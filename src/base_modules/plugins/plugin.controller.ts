import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { AuthUser } from 'src/decorators/UserDecorator';
import { TypedResponse } from 'src/types/apiResponses.types';
import { InternalError, NotAuthenticated } from 'src/types/error.types';

import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Plugin } from './plugin.entity';
import { PluginService } from './plugin.service';

@Controller('plugin')
export class PluginController {
    constructor(private readonly pluginService: PluginService) {}

    @ApiTags('Plugin')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':plugin_id')
    async get(
        @AuthUser() _user: AuthenticatedUser,
        @Param('plugin_id') plugin_id: string
    ): Promise<TypedResponse<Plugin>> {
        return { data: await this.pluginService.get(plugin_id) };
    }

    @ApiTags('Plugin')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get()
    async getAll(@AuthUser() _user: AuthenticatedUser): Promise<TypedResponse<Plugin[]>> {
        return { data: await this.pluginService.getAll() };
    }
}
