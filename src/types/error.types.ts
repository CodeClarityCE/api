import { ApiProperty } from "@nestjs/swagger";
import { ValidationError } from "class-validator";

import { Status } from "./apiResponses.types";

export class APIError extends Error {
  // extends HttpException {

  static errorCode: string;
  static errorMessage: string;
  static statusCode: number;

  @ApiProperty()
  status_code!: number;

  @ApiProperty()
  status!: Status;

  @ApiProperty()
  error_code!: string;

  @ApiProperty()
  error_message!: string;

  errorCause?: unknown;

  constructor(
    errorCode: string,
    message: string,
    httpStatusCode: number,
    errorCause?: unknown,
  ) {
    super();
    // super("", httpStatusCode, { cause: errorCause })
    this.error_code = errorCode;
    this.error_message = message;
    this.status_code = httpStatusCode;
    this.errorCause = errorCause;
    this.status = Status.Failure;
  }

  getErrorCode(): string {
    return this.error_code;
  }

  getMessage(): string {
    return this.error_message;
  }

  getHttpStatusCode(): number {
    return this.status_code;
  }

  getCause(): unknown {
    return this.errorCause;
  }
}

export const errorMessages = {
  ValidationFailed: "Malformed request",
  NotAuthenticated: "You are not authenticated.",
  NotAuthorized: "You are not authorized to perform this action.",
  AccountNotActivated:
    "Your account is not activated yet. Follow the link in the activation email first.",
  OrganizationTokenScopeTooNarrow:
    "The scope of this Organization token does not allow this action.",
  UnknownWorkspace: "The referenced workspace does not exist on the project.",
  SourceVerdictsNotAvailable:
    "This analysis predates source verdicts. Re-run it to export them.",
  PluginFailed: "The plugin failed to run.",
  PluginResultNotAvailable:
    "The plugin result is not available, and thus either not finished or failed to finish properly.",
  CannotRemoveDefaultPolicy:
    "The policy is set as default and cannot be deleted (unless its the only policy of its kind). Instead update a different policy to be the default policy and then delete the originally intented policy.",
  CannotUnDefaultDefaultPolicy:
    "A default policy cannot be undefaulted. Instead update a different policy to be the default policy.",
  RepositoryCannotBeFound:
    "The repository that you are trying to import does not exist in the integration.",
  IntegrationNotSupported: "The integration is not yet supported.",
  ImportTargetNotAllowed:
    "The repository url points at an internal or reserved address.",
  IntegrationDoesNotExist: "The integration does not exist.",
  IntegrationTokenExpired:
    "The requested action cannot be performed because the token has expired.",
  IntegrationTokenRefreshFailed:
    "The integration token could not be refreshed from the provider.",
  DuplicateIntegration:
    "You have an existing integration with the integration provider.",
  ProjectDoesNotExist: "The project referenced does not exist.",
  IntegrationWrongTokenType: "The token type is not supported.",
  IntegrationInstanceUrlNotAllowed:
    "The GitLab instance URL must use https and resolve to a public address, unless the operator allows its host.",
  IntegrationInstanceUnreachable:
    "The GitLab instance's host name could not be resolved.",
  IntegrationInstanceUrlChanged:
    "The integration's instance URL cannot be changed. Delete the integration and connect it again instead.",
  FailedToRetrieveReposFromProvider:
    "The provider could not be succesfully reached to retrieve the repositories.",
  IntegrationTokenRetrievalFailed:
    "The integration token could not be retrieved from the provider.",
  IntegrationInvalidToken:
    "The requested action cannot be performed because the token is not valid or has been revoked.",
  PersonalOrgCannotBeModified: "A personal org cannot be modified.",
  FailedToCreateApiKey: "Failed to generate the api key.",
  InvitationExpired: "Invitation expired.",
  EmailAlreadyExists:
    "The requested user could not be created because a different user with the same email already exists.",
  AlreadyExists:
    "The requested entity could not be created because it already exists.",
  UserDoesNotExist: "The referenced user does not exists.",
  NotAMember: "The user is not a member of the referenced organization.",
  CannotLeaveAsLastOwner:
    "You cannot leave the organization as the last owner.",
  CannotRevokeOwnMembership: "You cannot revoke your own membership.",
  InvitationInvalidOrExpired: "The invitation does not exist or has expired.",
  EntityNotFound: "The requested entity could not be found.",
  EntityInUse:
    "The requested entity cannot be deleted because other entities still use it.",
  IntegrationIntegrationTokenMissingPermissions:
    "An integration token has missing permissions.",
  FailedToSendPasswordResetEmail:
    "An error occurred while trying to send the password reset email.",
  FailedToSendOrganizationInviteEmail:
    "An error occurred while trying to send the organization invitation email.",
} satisfies Record<string, string>;

export class PublicAPIError extends APIError {}

export class PrivateAPIError extends APIError {
  loggingErrorCode!: string;
  loggingErrorMessage!: string;

  constructor(
    errorCode: string,
    message: string,
    httpStatusCode: number,
    loggingErrorCode: string,
    loggingErrorMessage: string,
    cause?: unknown,
  ) {
    super(errorCode, message, httpStatusCode, cause);
    this.loggingErrorCode = loggingErrorCode;
    this.loggingErrorMessage = loggingErrorMessage;
  }
}

export class ValidationFailed extends PublicAPIError {
  static readonly errorCode = "ValidationFailed";
  static errorMessage = errorMessages[ValidationFailed.errorCode];
  static statusCode = 400;
  validationErrors!: unknown[];
  constructor(errors: ValidationError[], cause?: unknown) {
    super(
      ValidationFailed.errorCode,
      ValidationFailed.errorMessage,
      ValidationFailed.statusCode,
      cause,
    );
    this.validationErrors = [];
    for (const validationError of errors) {
      this.validationErrors.push({
        property: validationError.property,
        errors: validationError.constraints
          ? Object.values(validationError.constraints)
          : [],
      });
    }
  }
}

export class NotAuthenticated extends PublicAPIError {
  static readonly errorCode = "NotAuthenticated";
  static errorMessage = errorMessages[NotAuthenticated.errorCode];
  static statusCode = 401;
  constructor(cause?: unknown) {
    super(
      NotAuthenticated.errorCode,
      NotAuthenticated.errorMessage,
      NotAuthenticated.statusCode,
      cause,
    );
  }
}

export class NotAuthorized extends PublicAPIError {
  static readonly errorCode = "NotAuthorized";
  static errorMessage = errorMessages[NotAuthorized.errorCode];
  static statusCode = 403;
  constructor(cause?: unknown) {
    super(
      NotAuthorized.errorCode,
      NotAuthorized.errorMessage,
      NotAuthorized.statusCode,
      cause,
    );
  }
}

/** An Organization token called a route that needs a wider scope than it has. */
export class OrganizationTokenScopeTooNarrow extends PublicAPIError {
  static readonly errorCode = "OrganizationTokenScopeTooNarrow";
  static errorMessage =
    errorMessages[OrganizationTokenScopeTooNarrow.errorCode];
  static statusCode = 403;
  constructor(cause?: unknown) {
    super(
      OrganizationTokenScopeTooNarrow.errorCode,
      OrganizationTokenScopeTooNarrow.errorMessage,
      OrganizationTokenScopeTooNarrow.statusCode,
      cause,
    );
  }
}

export class UnknownWorkspace extends PublicAPIError {
  static readonly errorCode = "UnknownWorkspace";
  static errorMessage = errorMessages[UnknownWorkspace.errorCode];
  static statusCode = 404;
  constructor(cause?: unknown) {
    super(
      UnknownWorkspace.errorCode,
      UnknownWorkspace.errorMessage,
      UnknownWorkspace.statusCode,
      cause,
    );
  }
}

export class SourceVerdictsNotAvailable extends PublicAPIError {
  static readonly errorCode = "SourceVerdictsNotAvailable";
  static errorMessage = errorMessages[SourceVerdictsNotAvailable.errorCode];
  static statusCode = 409;
  constructor(cause?: unknown) {
    super(
      SourceVerdictsNotAvailable.errorCode,
      SourceVerdictsNotAvailable.errorMessage,
      SourceVerdictsNotAvailable.statusCode,
      cause,
    );
  }
}

export class PluginFailed extends PublicAPIError {
  static readonly errorCode = "PluginResultFailed";
  // Its code is not its message key, so the message is looked up by name.
  static errorMessage = errorMessages.PluginFailed;
  static statusCode = 500;
  constructor(cause?: unknown) {
    super(
      PluginFailed.errorCode,
      PluginFailed.errorMessage,
      PluginFailed.statusCode,
      cause,
    );
  }
}

export class PluginResultNotAvailable extends PublicAPIError {
  static readonly errorCode = "PluginResultNotAvailable";
  static errorMessage = errorMessages[PluginResultNotAvailable.errorCode];
  static statusCode = 500;
  constructor(cause?: unknown) {
    super(
      PluginResultNotAvailable.errorCode,
      PluginResultNotAvailable.errorMessage,
      PluginResultNotAvailable.statusCode,
      cause,
    );
  }
}

export class IntegrationNotSupported extends PublicAPIError {
  static readonly errorCode = "IntegrationNotSupported";
  static errorMessage = errorMessages[IntegrationNotSupported.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationNotSupported.errorCode,
      IntegrationNotSupported.errorMessage,
      IntegrationNotSupported.statusCode,
      cause,
    );
  }
}

export class ImportTargetNotAllowed extends PublicAPIError {
  static readonly errorCode = "ImportTargetNotAllowed";
  static errorMessage = errorMessages[ImportTargetNotAllowed.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      ImportTargetNotAllowed.errorCode,
      ImportTargetNotAllowed.errorMessage,
      ImportTargetNotAllowed.statusCode,
      cause,
    );
  }
}

export class IntegrationTokenExpired extends PublicAPIError {
  static readonly errorCode = "IntegrationTokenExpired";
  static errorMessage = errorMessages[IntegrationTokenExpired.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationTokenExpired.errorCode,
      IntegrationTokenExpired.errorMessage,
      IntegrationTokenExpired.statusCode,
      cause,
    );
  }
}

export class IntegrationTokenRefreshFailed extends PublicAPIError {
  static readonly errorCode = "IntegrationTokenRefreshFailed";
  static errorMessage = errorMessages[IntegrationTokenRefreshFailed.errorCode];
  static statusCode = 500;
  constructor(cause?: unknown) {
    super(
      IntegrationTokenRefreshFailed.errorCode,
      IntegrationTokenRefreshFailed.errorMessage,
      IntegrationTokenRefreshFailed.statusCode,
      cause,
    );
  }
}

export class DuplicateIntegration extends PublicAPIError {
  static readonly errorCode = "DuplicateIntegration";
  static errorMessage = errorMessages[DuplicateIntegration.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      DuplicateIntegration.errorCode,
      DuplicateIntegration.errorMessage,
      DuplicateIntegration.statusCode,
      cause,
    );
  }
}

export class ProjectDoesNotExist extends PublicAPIError {
  static readonly errorCode = "ProjectDoesNotExist";
  static errorMessage = errorMessages[ProjectDoesNotExist.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      ProjectDoesNotExist.errorCode,
      ProjectDoesNotExist.errorMessage,
      ProjectDoesNotExist.statusCode,
      cause,
    );
  }
}

export class IntegrationWrongTokenType extends PublicAPIError {
  static readonly errorCode = "IntegrationWrongTokenType";
  static errorMessage = errorMessages[IntegrationWrongTokenType.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationWrongTokenType.errorCode,
      IntegrationWrongTokenType.errorMessage,
      IntegrationWrongTokenType.statusCode,
      cause,
    );
  }
}

export class FailedToRetrieveReposFromProvider extends PublicAPIError {
  static readonly errorCode = "FailedToRetrieveReposFromProvider";
  static errorMessage =
    errorMessages[FailedToRetrieveReposFromProvider.errorCode];
  static statusCode = 500;
  constructor(cause?: unknown) {
    super(
      FailedToRetrieveReposFromProvider.errorCode,
      FailedToRetrieveReposFromProvider.errorMessage,
      FailedToRetrieveReposFromProvider.statusCode,
      cause,
    );
  }
}

export class IntegrationTokenRetrievalFailed extends PublicAPIError {
  static readonly errorCode = "IntegrationTokenRetrievalFailed";
  static errorMessage =
    errorMessages[IntegrationTokenRetrievalFailed.errorCode];
  static statusCode = 500;
  constructor(cause?: unknown) {
    super(
      IntegrationTokenRetrievalFailed.errorCode,
      IntegrationTokenRetrievalFailed.errorMessage,
      IntegrationTokenRetrievalFailed.statusCode,
      cause,
    );
  }
}

export class IntegrationInvalidToken extends PublicAPIError {
  static readonly errorCode = "IntegrationInvalidToken";
  static errorMessage = errorMessages[IntegrationInvalidToken.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationInvalidToken.errorCode,
      IntegrationInvalidToken.errorMessage,
      IntegrationInvalidToken.statusCode,
      cause,
    );
  }
}

export class IntegrationInstanceUrlChanged extends PublicAPIError {
  static readonly errorCode = "IntegrationInstanceUrlChanged";
  static errorMessage = errorMessages[IntegrationInstanceUrlChanged.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationInstanceUrlChanged.errorCode,
      IntegrationInstanceUrlChanged.errorMessage,
      IntegrationInstanceUrlChanged.statusCode,
      cause,
    );
  }
}

export class IntegrationInstanceUrlNotAllowed extends PublicAPIError {
  static readonly errorCode = "IntegrationInstanceUrlNotAllowed";
  static errorMessage =
    errorMessages[IntegrationInstanceUrlNotAllowed.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationInstanceUrlNotAllowed.errorCode,
      IntegrationInstanceUrlNotAllowed.errorMessage,
      IntegrationInstanceUrlNotAllowed.statusCode,
      cause,
    );
  }
}

export class IntegrationInstanceUnreachable extends PublicAPIError {
  static readonly errorCode = "IntegrationInstanceUnreachable";
  static errorMessage = errorMessages[IntegrationInstanceUnreachable.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationInstanceUnreachable.errorCode,
      IntegrationInstanceUnreachable.errorMessage,
      IntegrationInstanceUnreachable.statusCode,
      cause,
    );
  }
}

export class AccountNotActivated extends PublicAPIError {
  static readonly errorCode = "AccountNotActivated";
  static errorMessage = errorMessages[AccountNotActivated.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      AccountNotActivated.errorCode,
      AccountNotActivated.errorMessage,
      AccountNotActivated.statusCode,
      cause,
    );
  }
}

export class PersonalOrgCannotBeModified extends PublicAPIError {
  static readonly errorCode = "PersonalOrgCannotBeModified";
  static errorMessage = errorMessages[PersonalOrgCannotBeModified.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      PersonalOrgCannotBeModified.errorCode,
      PersonalOrgCannotBeModified.errorMessage,
      PersonalOrgCannotBeModified.statusCode,
      cause,
    );
  }
}

export class EmailAlreadyExists extends PublicAPIError {
  static readonly errorCode = "EmailAlreadyExists";
  static errorMessage = errorMessages[EmailAlreadyExists.errorCode];
  static statusCode = 409;
  constructor(cause?: unknown) {
    super(
      EmailAlreadyExists.errorCode,
      EmailAlreadyExists.errorMessage,
      EmailAlreadyExists.statusCode,
      cause,
    );
  }
}

export class AlreadyExists extends PublicAPIError {
  static readonly errorCode = "AlreadyExists";
  static errorMessage = errorMessages[AlreadyExists.errorCode];
  static statusCode = 409;
  constructor(cause?: unknown) {
    super(
      AlreadyExists.errorCode,
      AlreadyExists.errorMessage,
      AlreadyExists.statusCode,
      cause,
    );
  }
}

export class UserDoesNotExist extends PublicAPIError {
  static readonly errorCode = "UserDoesNotExist";
  static errorMessage = errorMessages[UserDoesNotExist.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      UserDoesNotExist.errorCode,
      UserDoesNotExist.errorMessage,
      UserDoesNotExist.statusCode,
      cause,
    );
  }
}

export class NotAMember extends PublicAPIError {
  static readonly errorCode = "NotAMember";
  static errorMessage = errorMessages[NotAMember.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      NotAMember.errorCode,
      NotAMember.errorMessage,
      NotAMember.statusCode,
      cause,
    );
  }
}

export class CannotLeaveAsOwner extends PublicAPIError {
  static readonly errorCode = "CannotLeaveAsLastOwner";
  static errorMessage = errorMessages[CannotLeaveAsOwner.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      CannotLeaveAsOwner.errorCode,
      CannotLeaveAsOwner.errorMessage,
      CannotLeaveAsOwner.statusCode,
      cause,
    );
  }
}

export class CannotRevokeOwnMembership extends PublicAPIError {
  static readonly errorCode = "CannotRevokeOwnMembership";
  static errorMessage = errorMessages[CannotRevokeOwnMembership.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      CannotRevokeOwnMembership.errorCode,
      CannotRevokeOwnMembership.errorMessage,
      CannotRevokeOwnMembership.statusCode,
      cause,
    );
  }
}

export class InvitationInvalidOrExpired extends PublicAPIError {
  static readonly errorCode = "InvitationInvalidOrExpired";
  static errorMessage = errorMessages[InvitationInvalidOrExpired.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      InvitationInvalidOrExpired.errorCode,
      InvitationInvalidOrExpired.errorMessage,
      InvitationInvalidOrExpired.statusCode,
      cause,
    );
  }
}

export class EntityNotFound extends PublicAPIError {
  static readonly errorCode = "EntityNotFound";
  static errorMessage = errorMessages[EntityNotFound.errorCode];
  static statusCode = 404;
  constructor(cause?: unknown) {
    super(
      EntityNotFound.errorCode,
      EntityNotFound.errorMessage,
      EntityNotFound.statusCode,
      cause,
    );
  }
}

export class EntityInUse extends PublicAPIError {
  static readonly errorCode = "EntityInUse";
  static errorMessage = errorMessages[EntityInUse.errorCode];
  static statusCode = 409;
  constructor(cause?: unknown) {
    super(
      EntityInUse.errorCode,
      EntityInUse.errorMessage,
      EntityInUse.statusCode,
      cause,
    );
  }
}

export class IntegrationTokenMissingPermissions extends PublicAPIError {
  static readonly errorCode = "IntegrationIntegrationTokenMissingPermissions";
  static errorMessage =
    errorMessages[IntegrationTokenMissingPermissions.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      IntegrationTokenMissingPermissions.errorCode,
      IntegrationTokenMissingPermissions.errorMessage,
      IntegrationTokenMissingPermissions.statusCode,
      cause,
    );
  }
}

export class FailedToSendOrganizationInviteEmail extends PublicAPIError {
  static readonly errorCode = "FailedToSendOrganizationInviteEmail";
  static errorMessage =
    errorMessages[FailedToSendOrganizationInviteEmail.errorCode];
  static statusCode = 500;
  constructor(cause?: unknown) {
    super(
      FailedToSendOrganizationInviteEmail.errorCode,
      FailedToSendOrganizationInviteEmail.errorMessage,
      FailedToSendOrganizationInviteEmail.statusCode,
      cause,
    );
  }
}

export class InternalError extends PrivateAPIError {
  constructor(errorCode: string, errorMessage: string, cause?: unknown) {
    super(
      "InternalError",
      "We encountered a problem while processing your request.",
      500,
      errorCode,
      errorMessage,
      cause,
    );
  }
}
