import { PublicAPIError } from 'src/types/error.types';

export const errorMessages: Record<string, string> = {
    SetupAlreadyDone:
        'The requested action cannot be performed on the social account because it is already setup.',
    FailedToSendAccountRegistrationVerificationEmail:
        'An error occured while trying to send the account registration verficiation email.',
    CannotPerformActionOnSocialAccount:
        'The requested action cannot be performed on a social account.',
    CannotPerformActionOnNormalAccount:
        'The requested action cannot be performed on a normal account.'
};

export class SetupAlreadyDone extends PublicAPIError {
    static errorCode = 'SetupAlreadyDone';
    static errorMessage = errorMessages[SetupAlreadyDone.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            SetupAlreadyDone.errorCode,
            SetupAlreadyDone.errorMessage,
            SetupAlreadyDone.statusCode,
            cause
        );
    }
}

export class FailedToSendAccountRegistrationVerificationEmail extends PublicAPIError {
    static errorCode = 'FailedToSendAccountRegistrationVerificationEmail';
    static errorMessage =
        errorMessages[FailedToSendAccountRegistrationVerificationEmail.errorCode]!;
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            FailedToSendAccountRegistrationVerificationEmail.errorCode,
            FailedToSendAccountRegistrationVerificationEmail.errorMessage,
            FailedToSendAccountRegistrationVerificationEmail.statusCode,
            cause
        );
    }
}

export class CannotPerformActionOnSocialAccount extends PublicAPIError {
    static errorCode = 'CannotPerformActionOnSocialAccount';
    static errorMessage = errorMessages[CannotPerformActionOnSocialAccount.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            CannotPerformActionOnSocialAccount.errorCode,
            CannotPerformActionOnSocialAccount.errorMessage,
            CannotPerformActionOnSocialAccount.statusCode,
            cause
        );
    }
}

export class CannotPerformActionOnNormalAccount extends PublicAPIError {
    static errorCode = 'CannotPerformActionOnNormalAccount';
    static errorMessage = errorMessages[CannotPerformActionOnNormalAccount.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            CannotPerformActionOnNormalAccount.errorCode,
            CannotPerformActionOnNormalAccount.errorMessage,
            CannotPerformActionOnNormalAccount.statusCode,
            cause
        );
    }
}
