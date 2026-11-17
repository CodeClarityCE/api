import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import type { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import {
  CodeClarityLogger,
  type LogContext,
} from "src/services/logger.service";

import { ErrorReportDto } from "./error-report.dto";
import { ErrorReportSizeGuard } from "./error-report-size.guard";

// The only context keys an error report may carry into the logs.
const ALLOWED_FIELDS = [
  "route",
  "component",
  "organizationId",
  "projectId",
  "analysisId",
  "stack",
] as const;

/** Receives error reports from the web app and writes them to the central logs. */
@Controller("logs")
export class LogsController {
  private readonly logger = CodeClarityLogger.forService("frontend");

  @Post()
  @HttpCode(204)
  @UseGuards(ThrottlerGuard, ErrorReportSizeGuard)
  receive(
    @AuthUser() user: AuthenticatedUser,
    @Body() report: ErrorReportDto,
  ): void {
    const context: LogContext = {
      ...allowedFields(report.fields),
      userId: user.userId,
      source: "frontend",
      receivedAt: new Date().toISOString(),
    };

    if (report.level === "error") {
      this.logger.error(report.msg, undefined, context);
    } else {
      this.logger.warn(report.msg, context);
    }
  }
}

// Keeps allow-listed string fields and drops everything else.
function allowedFields(
  fields: Record<string, unknown> | undefined,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const key of ALLOWED_FIELDS) {
    const value = fields?.[key];
    if (typeof value === "string") kept[key] = value;
  }
  return kept;
}
