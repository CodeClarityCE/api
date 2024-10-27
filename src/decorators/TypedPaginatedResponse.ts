import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { TypedPaginatedResponse } from 'src/types/apiResponses';

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
