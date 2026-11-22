import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

const ERROR_REPORT_LEVELS = ["error", "warn"] as const;
export type ErrorReportLevel = (typeof ERROR_REPORT_LEVELS)[number];

/** Body of an error report sent by the web app. */
export class ErrorReportDto {
  @IsIn(ERROR_REPORT_LEVELS)
  level!: ErrorReportLevel;

  @IsString()
  @MaxLength(2048)
  msg!: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;
}
