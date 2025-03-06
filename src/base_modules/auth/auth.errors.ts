import { PublicAPIError } from "src/types/error.types";

export const errorMessages: { [key: string]: string } = {
    SetupAlreadyDone:
        'An error occured while trying to send the account registration verficiation email.',
    AccountRegistrationVerificationTokenInvalidOrExpired:
        'The account registration verification token does not exist or has expired.',
    HandleAlreadyExists:
        'The requested user could not be created because a different user with the same handle already exists.',
};


export class AccountRegistrationVerificationTokenInvalidOrExpired extends PublicAPIError {
    static errorCode = 'AccountRegistrationVerificationTokenInvalidOrExpired';
    static errorMessage =
        errorMessages[AccountRegistrationVerificationTokenInvalidOrExpired.errorCode];
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
    static errorMessage = errorMessages[HandleAlreadyExists.errorCode];
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
