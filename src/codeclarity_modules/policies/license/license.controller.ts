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
import { AuthUser } from 'src/decorators/UserDecorator';
import { LicensePolicyService } from './license.service';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses';
import {
    LicensePolicyCreateBody,
    LicensePolicyPatchBody
} from 'src/types/entities/frontend/LicensePolicy';
import { Policy, PolicyFrontend } from 'src/codeclarity_modules/policies/policy.entity';

@Controller('org/:org_id/policies/license_policy')
export class LicensePolicyController {
    constructor(private readonly licensePolicyService: LicensePolicyService) {}

    @Post('')
    async create(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Body() createBody: LicensePolicyCreateBody
    ): Promise<CreatedResponse> {
        return { id: await this.licensePolicyService.create(org_id, createBody, user) };
    }

    @Get(':policy_id')
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('policy_id') policy_id: string
    ): Promise<TypedResponse<Policy>> {
        return { data: await this.licensePolicyService.get(org_id, policy_id, user) };
    }

    @Get('')
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number
    ): Promise<TypedPaginatedResponse<PolicyFrontend>> {
        return await this.licensePolicyService.getMany(
            org_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user
        );
    }

    @Patch(':policy_id')
    async update(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('policy_id') policy_id: string,
        @Body() licensePolicyPatchBody: LicensePolicyPatchBody
    ): Promise<NoDataResponse> {
        await this.licensePolicyService.update(org_id, policy_id, licensePolicyPatchBody, user);
        return {};
    }

    @Delete(':policy_id')
    async remove(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('policy_id') policy_id: string
    ): Promise<NoDataResponse> {
        await this.licensePolicyService.remove(org_id, policy_id, user);
        return {};
    }
}
