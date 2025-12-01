import { applyDecorators, type Type } from '@nestjs/common';
import {
    ApiExtraModels,
    ApiResponse,
    getSchemaPath,
    type ApiResponseOptions
} from '@nestjs/swagger';
import { Status } from 'src/types/apiResponses.types';
import { PublicAPIError, errorMessages, type APIError } from 'src/types/error.types';

/** Structure for API error response examples in OpenAPI documentation */
interface ErrorResponseExample {
    status_code: number;
    status_message: Status;
    error_code: string;
    error_message: string;
}

/** OpenAPI example wrapper with value property */
interface SwaggerExample {
    value: ErrorResponseExample;
}

export function ApiErrorDecorator({
    statusCode,
    errors,
    options
}: {
    statusCode: number;
    errors: Type<APIError>[];
    options?: ApiResponseOptions;
}): ReturnType<typeof applyDecorators> {
    const descriptions: string[] = [];
    let description = '';
    let example: ErrorResponseExample | Record<string, never> = {};
    const examples: Record<string, SwaggerExample> = {};

    if (errors.length > 1) {
        description = 'Throws errors: ';
        for (const err of errors) {
            descriptions.push(err.name);
            examples[err.name] = {
                value: {
                    status_code: statusCode,
                    status_message: Status.Failure,
                    error_code: err.name,
                    error_message: errorMessages[err.name] ?? err.name
                }
            };
        }
        description += descriptions.join(' or ');
        description += '.';
    } else {
        const err = errors[0]!;
        description = `Throws error: ${err.name}`;
        example = {
            status_code: statusCode,
            status_message: Status.Failure,
            error_code: err.name,
            error_message: errorMessages[err.name] ?? err.name
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
