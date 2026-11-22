import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { OrganizationTokenScope } from "src/base_modules/organizations/tokens/organization-token.types";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { AllowOrganizationToken } from "src/decorators/OrganizationTokenDecorator";
import { AuthUser } from "src/decorators/UserDecorator";
import { NoDataResponse, TypedResponse } from "src/types/apiResponses.types";
import {
  EntityNotFound,
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "src/types/error.types";

import { FileService } from "./file.service";
import {
  SingleFileInterceptor,
  type UploadedFilePart,
} from "./single-file.interceptor";

export interface UploadData {
  type: string;
  file_name: string;
  chunk: string;
  last: string;
  id: string;
  hash: string;
}

@Controller("/org/:organization_id/file/:project_id")
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @ApiTags("Files")
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @AllowOrganizationToken(OrganizationTokenScope.ANALYZE)
  @Patch("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(SingleFileInterceptor)
  @ApiBody({
    required: true,
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        type: {
          type: "string",
        },
      },
    },
  })
  async uploadFile(
    @AuthUser() user: AuthenticatedUser,
    @Param("project_id") project_id: string,
    @Param("organization_id") organization_id: string,
    @Body() queryParams: UploadData,
    @UploadedFile() file: UploadedFilePart,
  ): Promise<void> {
    // https://medium.com/@hackntosh/how-to-handle-file-uploading-with-nestjs-fastify-swagger-81afb08767ce
    if (!file) {
      throw new InternalError("500", "No file provided");
    }

    await this.fileService.uploadFile(
      user,
      file,
      project_id,
      organization_id,
      queryParams,
    );
    return;
  }

  @Delete(":file_id")
  async delete(
    @AuthUser() user: AuthenticatedUser,
    @Param("project_id") project_id: string,
    @Param("organization_id") organization_id: string,
    @Param("file_id") file_id: string,
  ): Promise<NoDataResponse> {
    await this.fileService.delete(file_id, organization_id, project_id, user);
    return {};
  }

  @ApiTags("Files")
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @Get(":file_name")
  async getFileByName(
    @AuthUser() user: AuthenticatedUser,
    @Param("project_id") project_id: string,
    @Param("organization_id") organization_id: string,
    @Param("file_name") file_name: string,
  ): Promise<TypedResponse<string>> {
    return {
      data: await this.fileService.readByName(
        organization_id,
        project_id,
        file_name,
        user,
      ),
    };
  }
}
