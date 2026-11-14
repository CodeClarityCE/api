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
  Query,
} from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  LicensePolicyCreateBody,
  LicensePolicyPatchBody,
} from "src/codeclarity_modules/policies/license/licensePolicy.types";
import { PolicyFrontend } from "src/codeclarity_modules/policies/policy.entity";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  CreatedResponse,
  NoDataResponse,
  TypedPaginatedResponse,
  TypedResponse,
} from "src/types/apiResponses.types";

import { LicensePolicyService } from "./license.service";

@Controller("org/:org_id/policies/license_policy")
export class LicensePolicyController {
  constructor(private readonly licensePolicyService: LicensePolicyService) {}

  @Post("")
  async create(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Body() createBody: LicensePolicyCreateBody,
  ): Promise<CreatedResponse> {
    return {
      id: await this.licensePolicyService.create(org_id, createBody, user),
    };
  }

  @Get(":policy_id")
  async get(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("policy_id") policy_id: string,
  ): Promise<TypedResponse<PolicyFrontend>> {
    const policy = await this.licensePolicyService.get(org_id, policy_id, user);
    // A plain object: the serializer drops every field of the bare entity
    return {
      data: {
        id: policy.id,
        name: policy.name,
        description: policy.description,
        default: policy.default,
        content: policy.content,
        created_on: policy.created_on,
        created_by: policy.created_by?.email || "",
        policy_type: policy.policy_type,
      },
    };
  }

  @Get("")
  async getMany(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Query("page", new DefaultValuePipe(0), ParseIntPipe) page?: number,
    @Query("entries_per_page", new DefaultValuePipe(0), ParseIntPipe)
    entries_per_page?: number,
  ): Promise<TypedPaginatedResponse<PolicyFrontend>> {
    return await this.licensePolicyService.getMany(
      org_id,
      { currentPage: page, entriesPerPage: entries_per_page },
      user,
    );
  }

  @Patch(":policy_id")
  async update(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("policy_id") policy_id: string,
    @Body() licensePolicyPatchBody: LicensePolicyPatchBody,
  ): Promise<NoDataResponse> {
    await this.licensePolicyService.update(
      org_id,
      policy_id,
      licensePolicyPatchBody,
      user,
    );
    return {};
  }

  @Delete(":policy_id")
  async remove(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") org_id: string,
    @Param("policy_id") policy_id: string,
  ): Promise<NoDataResponse> {
    await this.licensePolicyService.remove(org_id, policy_id, user);
    return {};
  }
}
