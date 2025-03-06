import { PublicAPIError } from 'src/types/error.types';

export const errorMessages: { [key: string]: string } = {
    AnalyzerDoesNotExist: 'The analyzer referenced does not exist.',
    AnaylzerMissingConfigAttribute:
        'A required configuration attribute to run an anylzer is missing.',
};
export class AnalyzerDoesNotExist extends PublicAPIError {
    static errorCode = 'AnalyzerDoesNotExist';
    static errorMessage = errorMessages[AnalyzerDoesNotExist.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            AnalyzerDoesNotExist.errorCode,
            AnalyzerDoesNotExist.errorMessage,
            AnalyzerDoesNotExist.statusCode,
            cause
        );
    }
}

export class AnaylzerMissingConfigAttribute extends PublicAPIError {
    static errorCode = 'AnaylzerMissingConfigAttribute';
    static errorMessage = errorMessages[AnaylzerMissingConfigAttribute.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            AnaylzerMissingConfigAttribute.errorCode,
            AnaylzerMissingConfigAttribute.errorMessage,
            AnaylzerMissingConfigAttribute.statusCode,
            cause
        );
    }
}
