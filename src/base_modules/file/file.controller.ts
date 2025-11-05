import { readFile } from 'fs';
import { join } from 'path';

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
import { FileInterceptor, MulterFile } from '@webundsoehne/nest-fastify-file-upload';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { ApiErrorDecorator } from 'src/decorators/ApiException';
import { AuthUser } from 'src/decorators/UserDecorator';
import { NoDataResponse, TypedResponse } from 'src/types/apiResponses.types';
import {
    EntityNotFound,
    InternalError,
    NotAuthenticated,
    NotAuthorized
} from 'src/types/error.types';
import { escapeString } from 'src/utils/cleaner';


import { FileService } from './file.service';


export interface UploadData {
    type: string;
    file_name: string;
    chunk: string;
    last: string;
    id: string;
    hash: string;
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
        @UploadedFile() file: MulterFile
    ): Promise<void> {
        // https://medium.com/@hackntosh/how-to-handle-file-uploading-with-nestjs-fastify-swagger-81afb08767ce
        if (!file) {
            throw new InternalError('500', 'No file provided');
        }

        await this.fileService.uploadFile(user, file, project_id, organization_id, queryParams);
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
        @AuthUser() _user: AuthenticatedUser,
        @Param('project_id') project_id: string,
        @Param('org_id') org_id: string,
        @Param('file_name') file_name: string
    ): Promise<TypedResponse<string>> {
        // Clean the file name to avoid directory traversal
        const cleanedFileName = escapeString(file_name);
        const cleanedProjectId = escapeString(project_id);
        const cleanedOrgId = escapeString(org_id);

        const downloadPath = process.env['DOWNLOAD_PATH'] || '/private';
        const filePath = join(downloadPath, cleanedOrgId, cleanedProjectId, cleanedFileName);
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
