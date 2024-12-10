import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    UploadedFile,
    UseInterceptors
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from 'src/types/auth/types';
import { AuthUser } from 'src/decorators/UserDecorator';
import {
    EntityNotFound,
    InternalError,
    NotAuthenticated,
    NotAuthorized
} from 'src/types/errors/types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { FileService } from './file.service';
import { FileInterceptor, File } from '@nest-lab/fastify-multer';
import { NoDataResponse, TypedResponse } from 'src/types/apiResponses';
import { join } from 'path';
import { readFile } from 'fs';
import { escapeString } from 'src/utils/cleaner';

export interface UploadData {
    type: string;
    file_name: string;
    chunk: boolean;
    last: boolean;
}

@Controller('/file/:project_id')
export class FileController {
    constructor(private readonly fileService: FileService) {}

    @ApiTags('Files')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Patch('upload')
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file'))
    @ApiBody({
        required: true,
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary'
                },
                type: {
                    type: 'string'
                }
            }
        }
    })
    async uploadFile(
        @AuthUser() user: AuthenticatedUser,
        @Param('project_id') project_id: string,
        @Param('organization_id') organization_id: string,
        @Body() queryParams: UploadData,
        @UploadedFile() file: File
    ): Promise<void> {
        // https://medium.com/@hackntosh/how-to-handle-file-uploading-with-nestjs-fastify-swagger-81afb08767ce
        if (!file) {
            throw new InternalError('500', 'No file provided');
        }

        this.fileService.uploadFile(user, file, project_id, organization_id, queryParams);
        return;
    }

    @Delete(':file_id')
    async delete(
        @AuthUser() user: AuthenticatedUser,
        @Param('project_id') project_id: string,
        @Param('organization_id') organization_id: string,
        @Param('file_id') file_id: string
    ): Promise<NoDataResponse> {
        await this.fileService.delete(file_id, organization_id, project_id, user);
        return {};
    }

    @ApiTags('Files')
    @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
    @ApiErrorDecorator({ statusCode: 404, errors: [EntityNotFound] })
    @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
    @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
    @Get(':project_id')
    async getFileByName(
        @AuthUser() user: AuthenticatedUser,
        @Param('project_id') project_id: string,
        @Param('org_id') org_id: string,
        @Param('file_name') file_name: string
    ): Promise<TypedResponse<string>> {
        // Clean the file name to avoid directory traversal
        const cleanedFileName = escapeString(file_name);
        const cleanedProjectId = escapeString(project_id);
        const cleanedOrgId = escapeString(org_id);
        const filePath = join('/private', cleanedOrgId, cleanedProjectId, cleanedFileName);
        return new Promise((resolve, reject) => {
            return readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                }
                resolve({
                    data: data
                });
            });
        });
    }
}
