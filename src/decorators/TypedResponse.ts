import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { TypedResponse } from 'src/types/apiResponses.types';

export const APIDocTypedResponseDecorator = <DataDto extends Type<unknown>>(dataDto: DataDto) =>
    applyDecorators(
        ApiExtraModels(TypedResponse, dataDto),
        ApiOkResponse({
            schema: {
                allOf: [
                    { $ref: getSchemaPath(TypedResponse) },
                    {
                        properties: {
                            data: { $ref: getSchemaPath(dataDto) }
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
