import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

const MAX_ERROR_REPORT_BYTES = 16 * 1024;

/** Rejects an error report whose body is over MAX_ERROR_REPORT_BYTES with 413. */
@Injectable()
export class ErrorReportSizeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = Number(request.headers["content-length"]);
    const size = Number.isFinite(header)
      ? header
      : Buffer.byteLength(JSON.stringify(request.body ?? ""));
    if (size > MAX_ERROR_REPORT_BYTES) {
      throw new PayloadTooLargeException(
        `Error report is over ${MAX_ERROR_REPORT_BYTES / 1024} KB`,
      );
    }
    return true;
  }
}
