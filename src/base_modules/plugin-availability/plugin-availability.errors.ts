import { PublicAPIError } from "src/types/error.types";

/** An analyzer needs a plugin nothing listens for; the message says which. */
export class AnalyzerUnavailable extends PublicAPIError {
  static readonly errorCode = "AnalyzerUnavailable";
  static errorMessage = "This analyzer cannot run on this instance right now.";
  static statusCode = 409;
  constructor(message?: string, cause?: unknown) {
    super(
      AnalyzerUnavailable.errorCode,
      message ?? AnalyzerUnavailable.errorMessage,
      AnalyzerUnavailable.statusCode,
      cause,
    );
  }
}
