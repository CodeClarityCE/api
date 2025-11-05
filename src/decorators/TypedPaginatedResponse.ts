import { TypedPaginatedResponse } from 'src/types/apiResponses.types';

import type { Type} from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';


export const APIDocTypedPaginatedResponseDecorator = <DataDto extends Type<unknown>>(
    dataDto: DataDto
) =>
    applyDecorators(
        ApiExtraModels(TypedPaginatedResponse, dataDto),
        ApiOkResponse({
            schema: {
                allOf: [
                    { $ref: getSchemaPath(TypedPaginatedResponse) },
                    {
                        properties: {
                            data: {
                                type: 'array',
                                items: { $ref: getSchemaPath(dataDto) }
                            }
                        }
                    },
                    {
                        properties: {
                            status_code: { type: 'number' },
                            status_message: { type: 'string' }
                        }
                    }
                ]
            }
        })
    );
