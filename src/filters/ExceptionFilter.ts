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
    catch(exception: Error, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        let status = 500;

        let errorCode = 'InternalError';
        let message = 'We encountered a problem while processing your request.';

        if (exception instanceof PublicAPIError) {
            const error: PublicAPIError = exception;
            status = error.getHttpStatusCode();
            const rawError: any = error;
            delete rawError['errorCause'];
            const object = snakeCase(rawError);
            response.status(status).send(JSON.stringify(object));
            return;
        } else if (exception instanceof PrivateAPIError) {
            const error: PrivateAPIError = exception;
            status = error.getHttpStatusCode();
            errorCode = error.getErrorCode();
            message = error.getMessage();
            // TODO: log
        } else if (exception instanceof HttpException) {
            const error: HttpException = exception;
            status = error.getStatus();
            message = error.message;
            // TODO: log
        } else {
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

function snakeCase(fields: any) {
    for (const key in fields) {
        if (fields[key] instanceof Object) {
            // recurse
            fields[key] = snakeCase(fields[key]);
        }

        const snakeKey = key
            .replace(/\.?([A-Z]+)/g, function (x, y) {
                return '_' + y.toLowerCase();
            })
            .replace(/^_/, '');

        // put new snakecase key
        fields[snakeKey] = fields[key];

        // remove old cameCase key
        if (snakeKey !== key) {
            delete fields[key];
        }
    }
    return fields;
}
