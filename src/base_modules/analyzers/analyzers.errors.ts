import { PublicAPIError } from "src/types/error.types";

export const errorMessages: Record<string, string> = {
  AnalyzerDoesNotExist: "The analyzer referenced does not exist.",
  AnaylzerMissingConfigAttribute:
    "A required configuration attribute to run an anylzer is missing.",
  AnalyzerHasNoPlugins: "An analyzer needs at least one plugin.",
  AnalyzerDependencyMissing:
    "A plugin in the analyzer is missing a plugin it depends on.",
};
export class AnalyzerDoesNotExist extends PublicAPIError {
  static errorCode = "AnalyzerDoesNotExist";
  static errorMessage = errorMessages[AnalyzerDoesNotExist.errorCode]!;
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      AnalyzerDoesNotExist.errorCode,
      AnalyzerDoesNotExist.errorMessage,
      AnalyzerDoesNotExist.statusCode,
      cause,
    );
  }
}

export class AnaylzerMissingConfigAttribute extends PublicAPIError {
  static errorCode = "AnaylzerMissingConfigAttribute";
  static errorMessage =
    errorMessages[AnaylzerMissingConfigAttribute.errorCode]!;
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      AnaylzerMissingConfigAttribute.errorCode,
      AnaylzerMissingConfigAttribute.errorMessage,
      AnaylzerMissingConfigAttribute.statusCode,
      cause,
    );
  }
}

export class AnalyzerHasNoPlugins extends PublicAPIError {
  static errorCode = "AnalyzerHasNoPlugins";
  static errorMessage = errorMessages[AnalyzerHasNoPlugins.errorCode]!;
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      AnalyzerHasNoPlugins.errorCode,
      AnalyzerHasNoPlugins.errorMessage,
      AnalyzerHasNoPlugins.statusCode,
      cause,
    );
  }
}

/** Names the plugin and what it is missing, e.g. "js-patching needs vuln-finder". */
export class AnalyzerDependencyMissing extends PublicAPIError {
  static errorCode = "AnalyzerDependencyMissing";
  static errorMessage = errorMessages[AnalyzerDependencyMissing.errorCode]!;
  static statusCode = 400;
  constructor(plugin: string, missing: string[], cause?: unknown) {
    super(
      AnalyzerDependencyMissing.errorCode,
      `${plugin} needs ${missing.join(" and ")} in the same or an earlier stage.`,
      AnalyzerDependencyMissing.statusCode,
      cause,
    );
  }
}
