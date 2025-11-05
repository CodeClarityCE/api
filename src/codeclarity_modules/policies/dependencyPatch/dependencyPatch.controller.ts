import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    DependencyPatchPolicy,
    DependencyPatchPolicyCreateBody,
    DependencyPatchPolicyPatchBody
} from 'src/codeclarity_modules/policies/dependencyPatch/dependencyPatchPolicy.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses.types';

import {
    Body,
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query
} from '@nestjs/common';

import { DependencyPatchPolicyService } from './dependencyPatch.service';


@Controller('org/:org_id/policies/dependency_patch')
export class DependencyPatchPolicyController {
    constructor(private readonly dependencyPatchPolicyService: DependencyPatchPolicyService) {}

    @Post('')
    async create(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Body() createBody: DependencyPatchPolicyCreateBody
    ): Promise<CreatedResponse> {
        return { id: await this.dependencyPatchPolicyService.create(org_id, createBody, user) };
    }

    @Get(':policy_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('policy_id') policy_id: string
    ): Promise<TypedResponse<DependencyPatchPolicy>> {
        return { data: await this.dependencyPatchPolicyService.get(org_id, policy_id, user) };
    }

    @Get('')
    async getMany(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) _page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) _entries_per_page?: number
    ): Promise<TypedPaginatedResponse<DependencyPatchPolicy>> {
        throw new Error('Method not implemented.');
        // return await this.dependencyPatchPolicyService.getMany(
        //     org_id,
        //     { currentPage: page, entriesPerPage: entries_per_page },
        //     user
        // );
    }

    @Patch(':policy_id')
    async update(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('policy_id') policy_id: string,
        @Body() dependencyPatchPolicyPatchBody: DependencyPatchPolicyPatchBody
    ): Promise<NoDataResponse> {
        await this.dependencyPatchPolicyService.update(
            org_id,
            policy_id,
            dependencyPatchPolicyPatchBody,
            user
        );
        return {};
    }

    @Delete(':policy_id')
    async remove(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('policy_id') policy_id: string
    ): Promise<NoDataResponse> {
        await this.dependencyPatchPolicyService.remove(org_id, policy_id, user);
        return {};
    }
}
