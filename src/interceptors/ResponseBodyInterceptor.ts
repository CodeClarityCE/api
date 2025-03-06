import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { Status } from 'src/types/apiResponses.types';
import { FastifyReply } from 'fastify';

/**
 * The goal of this interceptor is to add status_code and status fields to all responses bodies from the API
 */
export class ResponseBodyInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, handler: CallHandler): Observable<any> {
        const ctx = context.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const statusCode = response.statusCode;
        let status = Status.Success;
        if (statusCode >= 400 && statusCode < 600) {
            status = Status.Failure;
        }

        return handler.handle().pipe(
            map((data) => {
                let res: any = {};
                if (data) {
                    res = {
                        ...data
                    };
                }

                if (!('status_code' in res)) {
                    res['status_code'] = statusCode;
                }
                if (!('status' in res)) {
                    res['status'] = status;
                }
                return res;
            })
        );
    }
}
