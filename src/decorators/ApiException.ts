import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, ApiResponseOptions, getSchemaPath } from '@nestjs/swagger';
import { Status } from 'src/types/apiResponses.types';
import { APIError, PublicAPIError, errorMessages } from 'src/types/error.types';

export function ApiErrorDecorator({
    statusCode,
    errors,
    options
}: {
    statusCode: number;
    errors: Type<APIError>[];
    options?: ApiResponseOptions;
}) {
    const descriptions = [];
    let description = '';
    let example: any = {};
    const examples: { [key: string]: any } = {};

    if (errors.length > 1) {
        description = 'Throws errors: ';
        for (const err of errors) {
            descriptions.push(err.name);
            examples[err.name] = {
                value: {
                    status_code: statusCode,
                    status_message: Status.Failure,
                    error_code: err.name,
                    error_message: errorMessages[err.name]
                }
            };
        }
        description += descriptions.join(' or ');
        description += '.';
    } else {
        const err = errors[0];
        description = `Throws error: ${err.name}`;
        example = {
            status_code: statusCode,
            status_message: Status.Failure,
            error_code: err.name,
            error_message: errorMessages[err.name]
        };
    }

    if (options && !('description' in options)) {
        options.description = description;
    } else if (!options) {
        options = {};
        options.description = description;
    }

    if (errors.length > 1) {
        return applyDecorators(
            ApiExtraModels(PublicAPIError),
            ApiResponse({
                ...options,
                status: statusCode,
                content: {
                    'application/json': {
                        schema: {
                            $ref: getSchemaPath(PublicAPIError)
                        },
                        examples: examples
                    }
                }
            })
        );
    } else {
        return applyDecorators(
            ApiExtraModels(PublicAPIError),
            ApiResponse({
                ...options,
                status: statusCode,
                content: {
                    'application/json': {
                        schema: {
                            $ref: getSchemaPath(PublicAPIError)
                        },
                        example: example
                    }
                }
            })
        );
    }
}
