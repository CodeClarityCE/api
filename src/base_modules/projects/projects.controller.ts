import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { Project } from 'src/base_modules/projects/project.entity';
import { ProjectImportBody } from 'src/base_modules/projects/project.types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { AuthUser } from 'src/decorators/UserDecorator';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses.types';
import {
    AlreadyExists,
    EntityNotFound,
    InternalError,
    NotAuthenticated,
    NotAuthorized
} from 'src/types/error.types';
import { SortDirection } from 'src/types/sort.types';

import {
    Controller,
    Get,
    Post,
    Param,
    Delete,
    Body,
    Query,
    DefaultValuePipe,
    ParseIntPipe
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AllowedOrderByGetProjects, ProjectService } from './projects.service';



@ApiBearerAuth()
@Controller('org/:org_id/projects')
export class ProjectController {
    constructor(private readonly projectsService: ProjectService) {}

    @ApiTags('Projects')
    @APIDocCreatedResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 409, errors: [AlreadyExists] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Post('')
    async import(
        @Body() project: ProjectImportBody,
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string
    ): Promise<CreatedResponse> {
        return { id: await this.projectsService.import(org_id, project, user) };
    }

    @ApiTags('Projects')
    @APIDocTypedResponseDecorator(Project)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':project_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('project_id') project_id: string,
        @Param('org_id') org_id: string
    ): Promise<TypedResponse<Project>> {
        return {
            data: await this.projectsService.get(org_id, project_id, user)
        };
    }

    @ApiTags('Projects')
    @APIDocTypedPaginatedResponseDecorator(Project)
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'entries_per_page', required: false })
    @ApiQuery({ name: 'search_key', required: false })
    @ApiQuery({ name: 'sort_key', required: false })
    @ApiQuery({ name: 'sort_direction', required: false })
    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_key') sort_key?: AllowedOrderByGetProjects,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<Project>> {
        const pageParam = page ? parseInt(`${page  }`) : 0;
        const entriesPerPageParam = entries_per_page ? parseInt(`${entries_per_page  }`) : 0;
        return await this.projectsService.getMany(
            org_id,
            { currentPage: pageParam, entriesPerPage: entriesPerPageParam },
            user,
            search_key,
            sort_key,
            sort_direction
        );
    }

    @ApiTags('Projects')
    @APIDocNoDataResponseDecorator()
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Delete(':project_id')
    async delete(
        @AuthUser() user: AuthenticatedUser,
        @Param('project_id') project_id: string,
        @Param('org_id') org_id: string
    ): Promise<NoDataResponse> {
        await this.projectsService.delete(org_id, project_id, user);
        return {};
    }
}
