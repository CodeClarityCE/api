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
import { AllowedOrderByGetProjects, ProjectService } from './projects.service';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import {
    AlreadyExists,
    EntityNotFound,
    InternalError,
    NotAuthenticated,
    NotAuthorized
} from 'src/types/errors/types';
import { APIDocCreatedResponseDecorator } from 'src/decorators/CrudResponse';
import { APIDocTypedResponseDecorator } from 'src/decorators/TypedResponse';
import { APIDocTypedPaginatedResponseDecorator } from 'src/decorators/TypedPaginatedResponse';
import { APIDocNoDataResponseDecorator } from 'src/decorators/NoDataResponse';
import { SortDirection } from 'src/types/sort/types';
import { ProjectImportBody } from 'src/base_modules/projects/project.types';
import { Project } from 'src/base_modules/projects/project.entity';

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
    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('integration_id') integration_id?: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_key') sort_key?: AllowedOrderByGetProjects,
        @Query('sort_direction') sort_direction?: SortDirection
    ): Promise<TypedPaginatedResponse<Project>> {
        const pageParam = page ? parseInt(page + '') : 0;
        const entriesPerPageParam = entries_per_page ? parseInt(entries_per_page + '') : 0;
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
