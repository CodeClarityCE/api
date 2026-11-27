import { PublicAPIError } from "src/types/error.types";

const errorMessages = {
  AnalyzerDoesNotExist: "The analyzer referenced does not exist.",
  AnaylzerMissingConfigAttribute:
    "A required configuration attribute to run an analyzer is missing.",
  AnalyzerHasNoPlugins: "An analyzer needs at least one plugin.",
  AnalyzerDependencyMissing:
    "A plugin in the analyzer is missing a plugin it depends on.",
  AnalyzerHasAnalyses: "This analyzer has analyses, so it cannot be deleted.",
} satisfies Record<string, string>;
export class AnalyzerDoesNotExist extends PublicAPIError {
  static readonly errorCode = "AnalyzerDoesNotExist";
  static errorMessage = errorMessages[AnalyzerDoesNotExist.errorCode];
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
  static readonly errorCode = "AnaylzerMissingConfigAttribute";
  static errorMessage = errorMessages[AnaylzerMissingConfigAttribute.errorCode];
  static statusCode = 400;
  constructor(missing?: { plugin: string; option: string }, cause?: unknown) {
    super(
      AnaylzerMissingConfigAttribute.errorCode,
      missing
        ? `The plugin "${missing.plugin}" needs the option "${missing.option}", which is missing.`
        : AnaylzerMissingConfigAttribute.errorMessage,
      AnaylzerMissingConfigAttribute.statusCode,
      cause,
    );
  }
}

export class AnalyzerHasNoPlugins extends PublicAPIError {
  static readonly errorCode = "AnalyzerHasNoPlugins";
  static errorMessage = errorMessages[AnalyzerHasNoPlugins.errorCode];
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

/** Names the plugin and what it is missing, e.g. "license-finder needs js-sbom". */
export class AnalyzerDependencyMissing extends PublicAPIError {
  static readonly errorCode = "AnalyzerDependencyMissing";
  static errorMessage = errorMessages[AnalyzerDependencyMissing.errorCode];
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

export class AnalyzerHasAnalyses extends PublicAPIError {
  static readonly errorCode = "AnalyzerHasAnalyses";
  static errorMessage = errorMessages[AnalyzerHasAnalyses.errorCode];
  static statusCode = 409;
  constructor(cause?: unknown) {
    super(
      AnalyzerHasAnalyses.errorCode,
      AnalyzerHasAnalyses.errorMessage,
      AnalyzerHasAnalyses.statusCode,
      cause,
    );
  }
}
