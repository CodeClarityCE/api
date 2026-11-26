import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { QueryFailedError } from "typeorm";

import type { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  CodeClarityLogger,
  type LogContext,
} from "src/services/logger.service";
import { Status } from "src/types/apiResponses.types";
import { PrivateAPIError, PublicAPIError } from "src/types/error.types";

// Postgres errors caused by a malformed client value: a non-UUID id, an out-of-range page, a NUL character.
const BAD_INPUT_SQLSTATES = new Set(["22P02", "22003", "22021"]);

// Error codes for HttpException and FastifyError statuses that have a clear meaning to clients.
const HTTP_EXCEPTION_CODES: Partial<Record<number, string>> = {
  400: "BadRequest",
  413: "PayloadTooLarge",
  429: "TooManyRequests",
};

/**
 * The goal of this filter is to filter the information we expose to users in case of an exception
 * Additionally we change the error body to underscore/snake case
 * NestJS uses camel case, but we use to underscore/snake case for the api responses
 */
@Catch(Error)
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = CodeClarityLogger.forService("ErrorFilter");

  /**
   * Catches and processes exceptions thrown by routes.
   *
   * The goal of this method is to filter out sensitive information from error responses,
   * as well as convert them to snake_case format (underscores instead of camel case).
   */
  catch(exception: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest | undefined>();
    let status = 500;

    let errorCode = "InternalError";
    let message = "We encountered a problem while processing your request.";

    // Check if the exception is an instance of PublicAPIError
    if (exception instanceof PublicAPIError) {
      const error: PublicAPIError = exception;
      status = error.getHttpStatusCode();
      const rawError = error as unknown as Record<string, unknown>;
      delete rawError["errorCause"];
      const object = snakeCase(rawError);
      response.status(status).send(JSON.stringify(object));
      return;
    } else if (exception instanceof PrivateAPIError) {
      // Check if the exception is an instance of PrivateAPIError
      const error: PrivateAPIError = exception;
      status = error.getHttpStatusCode();
      errorCode = error.getErrorCode();
      message = error.getMessage();
      this.report(
        status,
        `[PrivateAPIError] ${error.loggingErrorCode}: ${error.loggingErrorMessage}`,
        error.getCause() ?? error,
        request,
      );
    } else if (exception instanceof HttpException) {
      // Check if the exception is an instance of HttpException
      const error: HttpException = exception;
      status = error.getStatus();
      errorCode = HTTP_EXCEPTION_CODES[status] ?? errorCode;
      message = error.message;
      this.report(status, `[HttpException] ${message}`, error, request);
    } else if (isBadInput(exception)) {
      status = 400;
      errorCode = "BadRequest";
      message = "A request parameter has an invalid value.";
    } else {
      // A client error from Fastify keeps its status; anything else is a generic InternalError.
      if ("name" in exception && exception.name === "FastifyError") {
        const fastifyException = exception as unknown as {
          statusCode: number;
          message: string;
        };
        if (
          fastifyException.statusCode >= 400 &&
          fastifyException.statusCode < 500
        ) {
          status = fastifyException.statusCode;
          errorCode = HTTP_EXCEPTION_CODES[status] ?? "BadRequest";
          message = fastifyException.message;
        }
      }
      const kind = status < 500 ? "[ClientError]" : "[UnhandledException]";
      this.report(status, `${kind} ${exception.message}`, exception, request);
    }

    response.status(status).send(
      JSON.stringify({
        status_code: status,
        status: Status.Failure,
        error_code: errorCode,
        error_message: message,
      }),
    );
  }

  // Logs a 5xx answer at error and a 4xx answer at warn, without the request body or headers.
  private report(
    status: number,
    message: string,
    cause: unknown,
    request: FastifyRequest | undefined,
  ): void {
    const context = requestContext(status, request);
    if (status >= 500) {
      this.logger.error(
        message,
        cause instanceof Error ? cause : String(cause),
        context,
      );
    } else {
      this.logger.warn(message, context);
    }
  }
}

// The route pattern, user and organization of a request, never its values or secrets.
function requestContext(
  status: number,
  request: FastifyRequest | undefined,
): LogContext {
  const context: LogContext = { status };
  if (!request) return context;
  context["method"] = request.method;
  const route = request.routeOptions?.url;
  if (route) context["route"] = route;
  const user = (request as { user?: AuthenticatedUser }).user;
  if (user?.userId) context.userId = user.userId;
  const params = request.params as Record<string, unknown> | undefined;
  const organizationId = params?.["org_id"] ?? params?.["organization_id"];
  if (typeof organizationId === "string") {
    context.organizationId = organizationId;
  }
  return context;
}

function isBadInput(exception: Error): boolean {
  if (!(exception instanceof QueryFailedError)) return false;
  const code = (exception.driverError as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && BAD_INPUT_SQLSTATES.has(code);
}

/**
 * Converts a JavaScript object with camelCase property names to an object with snake_case property names.
 *
 * This function is used to convert the error objects returned in API responses from NestJS's default camel case format to snake case, which is what our API clients expect.
 */
function snakeCase(fields: Record<string, unknown>): Record<string, unknown> {
  for (const key in fields) {
    const value = fields[key];

    // Handle arrays - recursively process each item
    if (Array.isArray(value)) {
      fields[key] = value.map((item: unknown) => {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          return snakeCase(item as Record<string, unknown>);
        }
        return item;
      });
    }
    // Handle nested objects
    else if (value !== null && typeof value === "object") {
      fields[key] = snakeCase(value as Record<string, unknown>);
    }

    const snakeKey = key
      .replace(/\.?([A-Z]+)/g, function (_x, y: string) {
        return `_${y.toLowerCase()}`;
      })
      .replace(/^_/, "");

    // Put the new snake_case property name into the object
    fields[snakeKey] = fields[key];

    // Remove the old camelCase property name from the object
    if (snakeKey !== key) {
      delete fields[key];
    }
  }

  return fields;
}
