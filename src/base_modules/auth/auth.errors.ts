import { PublicAPIError } from 'src/types/error.types';

export const errorMessages: { [key: string]: string } = {
    SetupAlreadyDone:
        'An error occured while trying to send the account registration verficiation email.',
    AccountRegistrationVerificationTokenInvalidOrExpired:
        'The account registration verification token does not exist or has expired.',
    HandleAlreadyExists:
        'The requested user could not be created because a different user with the same handle already exists.',
    RegistrationNotVerified:
        'Before being able to use our platform, verify your registration via the email send to your inbox.',
    WrongCredentials: 'You have entered the wrong credentials.',
    PasswordResetTokenInvalidOrExpired: 'The password reset token does not exist or has expired.',
    PasswordsDoNotMatch: 'The passwords do not match.'
};

export class AccountRegistrationVerificationTokenInvalidOrExpired extends PublicAPIError {
    static errorCode = 'AccountRegistrationVerificationTokenInvalidOrExpired';
    static errorMessage =
        errorMessages[AccountRegistrationVerificationTokenInvalidOrExpired.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            AccountRegistrationVerificationTokenInvalidOrExpired.errorCode,
            AccountRegistrationVerificationTokenInvalidOrExpired.errorMessage,
            AccountRegistrationVerificationTokenInvalidOrExpired.statusCode,
            cause
        );
    }
}

export class HandleAlreadyExists extends PublicAPIError {
    static errorCode = 'HandleAlreadyExists';
    static errorMessage = errorMessages[HandleAlreadyExists.errorCode]!;
    static statusCode = 409;
    constructor(cause?: unknown) {
        super(
            HandleAlreadyExists.errorCode,
            HandleAlreadyExists.errorMessage,
            HandleAlreadyExists.statusCode,
            cause
        );
    }
}

export class RegistrationNotVerified extends PublicAPIError {
    static errorCode = 'RegistrationNotVerified';
    static errorMessage = errorMessages[RegistrationNotVerified.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            RegistrationNotVerified.errorCode,
            RegistrationNotVerified.errorMessage,
            RegistrationNotVerified.statusCode,
            cause
        );
    }
}

export class WrongCredentials extends PublicAPIError {
    static errorCode = 'WrongCredentials';
    static errorMessage = errorMessages[WrongCredentials.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            WrongCredentials.errorCode,
            WrongCredentials.errorMessage,
            WrongCredentials.statusCode,
            cause
        );
    }
}

export class PasswordResetTokenInvalidOrExpired extends PublicAPIError {
    static errorCode = 'PasswordResetTokenInvalidOrExpired';
    static errorMessage = errorMessages[PasswordResetTokenInvalidOrExpired.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            PasswordResetTokenInvalidOrExpired.errorCode,
            PasswordResetTokenInvalidOrExpired.errorMessage,
            PasswordResetTokenInvalidOrExpired.statusCode,
            cause
        );
    }
}

export class PasswordsDoNotMatch extends PublicAPIError {
    static errorCode = 'PasswordsDoNotMatch';
    static errorMessage = errorMessages[PasswordsDoNotMatch.errorCode]!;
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            PasswordsDoNotMatch.errorCode,
            PasswordsDoNotMatch.errorCode,
            PasswordsDoNotMatch.statusCode,
            cause
        );
    }
}
