import { PublicAPIError } from "src/types/error.types";

export const errorMessages: Record<string, string> = {
  DatasetNotReady: "Only a READY dataset can be used in an experiment.",
  AnalyzerMissingRequiredPlugins:
    "The analyzer of an experiment must run js-sbom and vuln-finder.",
};

export class DatasetNotReady extends PublicAPIError {
  static errorCode = "DatasetNotReady";
  static errorMessage = errorMessages[DatasetNotReady.errorCode]!;
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      DatasetNotReady.errorCode,
      DatasetNotReady.errorMessage,
      DatasetNotReady.statusCode,
      cause,
    );
  }
}

export class AnalyzerMissingRequiredPlugins extends PublicAPIError {
  static errorCode = "AnalyzerMissingRequiredPlugins";
  static errorMessage =
    errorMessages[AnalyzerMissingRequiredPlugins.errorCode]!;
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      AnalyzerMissingRequiredPlugins.errorCode,
      AnalyzerMissingRequiredPlugins.errorMessage,
      AnalyzerMissingRequiredPlugins.statusCode,
      cause,
    );
  }
}
