import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Status } from 'src/types/apiResponses.types';
import { FastifyReply } from 'fastify';
import { PrivateAPIError, PublicAPIError } from 'src/types/error.types';

/**
 * The goal of this filter is to filter the information we expose to users in case of an exception
 * Additionally we change the error body to underscore/snake case
 * NestJS uses camel case, but we use to underscore/snake case for the api responses
 */
@Catch(Error)
export class ErrorFilter implements ExceptionFilter {
    /**
     * Catches and processes exceptions thrown by routes.
     *
     * The goal of this method is to filter out sensitive information from error responses,
     * as well as convert them to snake_case format (underscores instead of camel case).
     */
    catch(exception: Error, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        let status = 500;

        let errorCode = 'InternalError';
        let message = 'We encountered a problem while processing your request.';

        // Check if the exception is an instance of PublicAPIError
        if (exception instanceof PublicAPIError) {
            const error: PublicAPIError = exception;
            status = error.getHttpStatusCode();
            const rawError: any = error;
            delete rawError['errorCause'];
            const object = snakeCase(rawError);
            response.status(status).send(JSON.stringify(object));
            return;
        } else if (exception instanceof PrivateAPIError) {
            // Check if the exception is an instance of PrivateAPIError
            const error: PrivateAPIError = exception;
            status = error.getHttpStatusCode();
            errorCode = error.getErrorCode();
            message = error.getMessage();
            // TODO: log this exception for debugging purposes
        } else if (exception instanceof HttpException) {
            // Check if the exception is an instance of HttpException
            const error: HttpException = exception;
            status = error.getStatus();
            message = error.message;
            // TODO: log this exception for debugging purposes
        } else {
            // Catch any other unexpected exceptions and return a generic InternalError response
            if ('name' in exception && exception['name'] == 'FastifyError') {
                const fastifyException: any = exception;
                if (fastifyException['statusCode'] >= 400 && fastifyException['statusCode'] < 500) {
                    errorCode = 'BadRequest';
                    status = 400;
                    message = fastifyException['message'];
                }
            }
        }

        response.status(status).send(
            JSON.stringify({
                status_code: status,
                status: Status.Failure,
                error_code: errorCode,
                error_message: message
            })
        );
    }
}

/**
 * Converts a JavaScript object with camelCase property names to an object with snake_case property names.
 *
 * This function is used to convert the error objects returned in API responses from NestJS's default camel case format to snake case, which is what our API clients expect.
 */
function snakeCase(fields: any) {
    for (const key in fields) {
        if (fields[key] instanceof Object) {
            // Recursively call this function on nested objects
            fields[key] = snakeCase(fields[key]);
        }

        const snakeKey = key
            .replace(/\.?([A-Z]+)/g, function (x, y) {
                return '_' + y.toLowerCase();
            })
            .replace(/^_/, '');

        // Put the new snake_case property name into the object
        fields[snakeKey] = fields[key];

        // Remove the old camelCase property name from the object
        if (snakeKey !== key) {
            delete fields[key];
        }
    }

    return fields;
}