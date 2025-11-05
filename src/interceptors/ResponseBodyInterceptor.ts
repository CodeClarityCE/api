import { Status } from 'src/types/apiResponses.types';

import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * The goal of this interceptor is to add status_code and status fields to all responses bodies from the API
 */
export class ResponseBodyInterceptor implements NestInterceptor {
    /**
     * Handles each request by adding status code and status fields to the response body.
     *
     * @param context The current execution context.
     * @param handler The call handler for the current request.
     */
    intercept(context: ExecutionContext, handler: CallHandler): Observable<any> {
        const ctx = context.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const statusCode = response.statusCode;
        let status = Status.Success; // Default success status
        if (statusCode >= 400 && statusCode < 600) {
            // Check for failure status code (4xx or 5xx)
            status = Status.Failure; // Update status to failure
        }

        return handler.handle().pipe(
            map((data) => {
                let res: any = {}; // Initialize response object
                if (data) {
                    res = {
                        ...data
                    };
                }

                if (!('status_code' in res)) {
                    // Check if status code is missing
                    res.status_code = statusCode;
                }
                if (!('status' in res)) {
                    // Check if status is missing
                    res.status = status;
                }
                return res; // Return the updated response object
            })
        );
    }
}
