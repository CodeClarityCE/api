import { PublicAPIError } from "src/types/error.types";

export const errorMessages: Record<string, string> = {
  FailedToSendAccountRegistrationVerificationEmail:
    "An error occurred while trying to send the account registration verification email.",
  CannotPerformActionOnSocialAccount:
    "The requested action cannot be performed on a social account.",
};

export class FailedToSendAccountRegistrationVerificationEmail extends PublicAPIError {
  static errorCode = "FailedToSendAccountRegistrationVerificationEmail";
  static errorMessage =
    errorMessages[FailedToSendAccountRegistrationVerificationEmail.errorCode]!;
  static statusCode = 500;
  constructor(cause?: unknown) {
    super(
      FailedToSendAccountRegistrationVerificationEmail.errorCode,
      FailedToSendAccountRegistrationVerificationEmail.errorMessage,
      FailedToSendAccountRegistrationVerificationEmail.statusCode,
      cause,
    );
  }
}

export class CannotPerformActionOnSocialAccount extends PublicAPIError {
  static errorCode = "CannotPerformActionOnSocialAccount";
  static errorMessage =
    errorMessages[CannotPerformActionOnSocialAccount.errorCode]!;
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      CannotPerformActionOnSocialAccount.errorCode,
      CannotPerformActionOnSocialAccount.errorMessage,
      CannotPerformActionOnSocialAccount.statusCode,
      cause,
    );
  }
}
