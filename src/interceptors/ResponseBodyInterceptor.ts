import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { Status } from "src/types/apiResponses.types";

/** Response body with status fields added by the interceptor */
interface ResponseBody {
  status_code: number;
  status: Status;
  [key: string]: unknown;
}

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
  intercept(
    context: ExecutionContext,
    handler: CallHandler,
  ): Observable<ResponseBody> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const statusCode = response.statusCode;
    let status = Status.Success; // Default success status
    if (statusCode >= 400 && statusCode < 600) {
      // Check for failure status code (4xx or 5xx)
      status = Status.Failure; // Update status to failure
    }

    return handler.handle().pipe(
      map((data: unknown) => {
        const res: ResponseBody = {
          status_code: statusCode,
          status: status,
        };

        // Handle truthy data that can be spread (objects, arrays, strings)
        if (data !== null && data !== undefined) {
          // Spread the data - this handles objects, arrays, and strings
          // Arrays spread to numeric keys: [a,b] -> {0:a, 1:b}
          // Strings spread to character keys: 'ab' -> {0:'a', 1:'b'}
          // Objects spread normally
          const spread = { ...(data as object) };
          for (const [key, value] of Object.entries(spread)) {
            res[key] = value;
          }
        }

        // Preserve existing status fields from data if present
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const dataObj = data as Record<string, unknown>;
          if ("status_code" in dataObj) {
            res.status_code = dataObj["status_code"] as number;
          }
          if ("status" in dataObj) {
            res.status = dataObj["status"] as Status;
          }
        }

        return res;
      }),
    );
  }
}
