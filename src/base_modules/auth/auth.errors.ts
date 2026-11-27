import { PublicAPIError } from "src/types/error.types";

const errorMessages = {
  AccountRegistrationVerificationTokenInvalidOrExpired:
    "The account registration verification token does not exist or has expired.",
  HandleAlreadyExists:
    "The requested user could not be created because a different user with the same handle already exists.",
  RegistrationNotVerified:
    "Before being able to use our platform, verify your registration via the email send to your inbox.",
  WrongCredentials: "You have entered the wrong credentials.",
  PasswordResetTokenInvalidOrExpired:
    "The password reset token does not exist or has expired.",
  PasswordsDoNotMatch: "The passwords do not match.",
  IncorrectCurrentPassword: "The current password is incorrect.",
} satisfies Record<string, string>;

export class AccountRegistrationVerificationTokenInvalidOrExpired extends PublicAPIError {
  static readonly errorCode =
    "AccountRegistrationVerificationTokenInvalidOrExpired";
  static errorMessage =
    errorMessages[
      AccountRegistrationVerificationTokenInvalidOrExpired.errorCode
    ];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      AccountRegistrationVerificationTokenInvalidOrExpired.errorCode,
      AccountRegistrationVerificationTokenInvalidOrExpired.errorMessage,
      AccountRegistrationVerificationTokenInvalidOrExpired.statusCode,
      cause,
    );
  }
}

export class HandleAlreadyExists extends PublicAPIError {
  static readonly errorCode = "HandleAlreadyExists";
  static errorMessage = errorMessages[HandleAlreadyExists.errorCode];
  static statusCode = 409;
  constructor(cause?: unknown) {
    super(
      HandleAlreadyExists.errorCode,
      HandleAlreadyExists.errorMessage,
      HandleAlreadyExists.statusCode,
      cause,
    );
  }
}

export class RegistrationNotVerified extends PublicAPIError {
  static readonly errorCode = "RegistrationNotVerified";
  static errorMessage = errorMessages[RegistrationNotVerified.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      RegistrationNotVerified.errorCode,
      RegistrationNotVerified.errorMessage,
      RegistrationNotVerified.statusCode,
      cause,
    );
  }
}

export class WrongCredentials extends PublicAPIError {
  static readonly errorCode = "WrongCredentials";
  static errorMessage = errorMessages[WrongCredentials.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      WrongCredentials.errorCode,
      WrongCredentials.errorMessage,
      WrongCredentials.statusCode,
      cause,
    );
  }
}

export class PasswordResetTokenInvalidOrExpired extends PublicAPIError {
  static readonly errorCode = "PasswordResetTokenInvalidOrExpired";
  static errorMessage =
    errorMessages[PasswordResetTokenInvalidOrExpired.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      PasswordResetTokenInvalidOrExpired.errorCode,
      PasswordResetTokenInvalidOrExpired.errorMessage,
      PasswordResetTokenInvalidOrExpired.statusCode,
      cause,
    );
  }
}

export class PasswordsDoNotMatch extends PublicAPIError {
  static readonly errorCode = "PasswordsDoNotMatch";
  static errorMessage = errorMessages[PasswordsDoNotMatch.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      PasswordsDoNotMatch.errorCode,
      PasswordsDoNotMatch.errorMessage,
      PasswordsDoNotMatch.statusCode,
      cause,
    );
  }
}

export class IncorrectCurrentPassword extends PublicAPIError {
  static readonly errorCode = "IncorrectCurrentPassword";
  static errorMessage = errorMessages[IncorrectCurrentPassword.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IncorrectCurrentPassword.errorCode,
      IncorrectCurrentPassword.errorMessage,
      IncorrectCurrentPassword.statusCode,
      cause,
    );
  }
}
