import { Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  NoDataResponse,
  TypedPaginatedResponse,
} from "src/types/apiResponses.types";

import { ApiKeysService } from "./apiKeys.service";

@Controller("api_keys")
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @ApiTags("API Keys")
  @Get("")
  async getApiKeys() // @AuthUser() user: AuthenticatedUser,
  // @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
  // @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number
  : Promise<TypedPaginatedResponse<ApiKeysController>> {
    throw new Error("Not implemented");
  }

  @ApiTags("API Keys")
  @Post("")
  async createApiKey() // @AuthUser() user: AuthenticatedUser
  // @Body() apiKeyCreateBody: ApiKeyCreateBody
  : Promise<unknown> {
    throw new Error("Not implemented");
  }

  @ApiTags("API Keys")
  @Get(":api_key_id/usage_logs")
  async getApiKeyUsageLogs() // @AuthUser() user: AuthenticatedUser,
  // @Param('api_key_id') api_key_id: string,
  // @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
  // @Query('entries_per_page', new DefaultValuePipe(0), ParseIntPipe) entries_per_page?: number
  : Promise<TypedPaginatedResponse<unknown>> {
    throw new Error("Not implemented");
  }

  @ApiTags("API Keys")
  @Delete(":api_key_id")
  async deleteApiKey(
    @AuthUser() user: AuthenticatedUser,
    @Param("api_key_id") api_key_id: string,
  ): Promise<NoDataResponse> {
    await this.apiKeysService.deleteApiKey(api_key_id, user);
    return {};
  }
}
