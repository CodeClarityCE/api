import { ValidationError } from 'class-validator';
import { Status } from './apiResponses.types';
import { ApiProperty } from '@nestjs/swagger';

export class APIError extends Error {
    // extends HttpException {

    static errorCode: string;
    static errorMessage: string;
    static statusCode: number;

    @ApiProperty()
    status_code: number;

    @ApiProperty()
    status: Status;

    @ApiProperty()
    error_code: string;

    @ApiProperty()
    error_message: string;

    errorCause?: unknown;

    constructor(errorCode: string, message: string, httpStatusCode: number, errorCause?: unknown) {
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

export const errorMessages: { [key: string]: string } = {
    ValidationFailed: 'Malformed request',
    NotAuthenticated: 'You are not authenticated.',
    NotAuthorized: 'You are not authorized to perform this action.',
    Unsupported: 'The action you requested is not supported.',
    UnknownWorkspace: 'The referenced workspace does not exist on the project.',
    PluginFailed: 'The plugin failed to run.',
    PluginResultNotAvailable:
        'The plugin result is not available, and thus either not finished or failed to finish properly.',
    CannotRemoveDefaultPolicy:
        'The policy is set as default and cannot be deleted (unless its the only policy of its kind). Instead update a different policy to be the default policy and then delete the originally intented policy.',
    CannotUnDefaultDefaultPolicy:
        'A default policy cannot be undefaulted. Instead update a different policy to be the default policy.',
    RepositoryCannotBeFound:
        'The repository that you are trying to import does not exist in the integration.',
    IntegrationNotSupported: 'The integration is not yet supported.',
    IntegrationDoesNotExist: 'The integration does not exist.',
    IntegrationTokenExpired:
        'The requested action cannot be performed because the token has expired.',
    IntegrationTokenRefreshFailed:
        'The integration token could not be refreshed from the provider.',
    DuplicateIntegration: 'You have an existing integration with the integration provider.',
    ProjectDoesNotExist: 'The project referenced does not exist.',
    IntegrationWrongTokenType: 'The token type is not supported.',
    FailedToRetrieveReposFromProvider:
        'The provider could not be succesfully reached to retrieve the repositories.',
    IntegrationTokenRetrievalFailed:
        'The integration token could not be retrieved from the provider.',
    IntegrationInvalidToken:
        'The requested action cannot be performed because the token is not valid or has been revoked.',
    PersonalOrgCannotBeModified: 'A personal org cannot be modified.',
    FailedToCreateApiKey: 'Failed to generate the api key.',
    FailedToAuthenticateSocialAccount: 'Failed to authenticate social account.',
    InvitationExpired: 'Invitation expired.',
    EmailAlreadyExists:
        'The requested user could not be created because a different user with the same email already exists.',
    AlreadyExists: 'The requested entity could not be created because it already exists.',
    UserDoesNotExist: 'The referenced user does not exists.',
    UnsubscriptionTokenInvalidOrExpired: 'The unsubscription link is invalid or has expired.',
    NotAMember: 'The user is not a member of the referenced organization.',
    CannotLeaveAsLastOwner: 'You cannot leave the organization as the last owner.',
    CannotRevokeOwnMembership: 'You cannot revoke your own membership.',
    InvitationInvalidOrExpired: 'The invitation does not exist or has expired.',
    EntityNotFound: 'The requested entity could not be found.',
    IntegrationIntegrationTokenMissingPermissions: 'An integration token has missing permissions.',
    FailedToSendPasswordResetEmail:
        'An error occured while trying to send the password reset email.',
    FailedToSendOrganizationInviteEmail:
        'An error occured while trying to send the organization invitation email.'
};

export class PublicAPIError extends APIError {}

export class PrivateAPIError extends APIError {
    loggingErrorCode: string;
    loggingErrorMessage: string;

    constructor(
        errorCode: string,
        message: string,
        httpStatusCode: number,
        loggingErrorCode: string,
        loggingErrorMessage: string,
        cause?: unknown
    ) {
        super(errorCode, message, httpStatusCode, cause);
        this.loggingErrorCode = loggingErrorCode;
        this.loggingErrorMessage = loggingErrorMessage;
    }
}

export class ValidationFailed extends PublicAPIError {
    validationErrors: any[];
    constructor(errors: ValidationError[], cause?: unknown) {
        super('ValidationFailed', 'Malformed request', 400, cause);
        this.validationErrors = [];
        for (const validationError of errors) {
            this.validationErrors.push({
                property: validationError.property,
                errors: validationError.constraints
                    ? Object.values(validationError.constraints)
                    : []
            });
        }
    }
}

export class NotAuthenticated extends PublicAPIError {
    static errorCode = 'NotAuthenticated';
    static errorMessage = errorMessages[NotAuthenticated.errorCode];
    static statusCode = 401;
    constructor(cause?: unknown) {
        super(
            NotAuthenticated.errorCode,
            NotAuthenticated.errorMessage,
            NotAuthenticated.statusCode,
            cause
        );
    }
}

export class NotAuthorized extends PublicAPIError {
    static errorCode = 'NotAuthorized';
    static errorMessage = errorMessages[NotAuthorized.errorCode];
    static statusCode = 403;
    constructor(cause?: unknown) {
        super(NotAuthorized.errorCode, NotAuthorized.errorMessage, NotAuthorized.statusCode, cause);
    }
}

export class Unsupported extends PublicAPIError {
    static errorCode = 'Unsupported';
    static errorMessage = errorMessages[Unsupported.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(Unsupported.errorCode, Unsupported.errorMessage, Unsupported.statusCode, cause);
    }
}

export class UnknownWorkspace extends PublicAPIError {
    static errorCode = 'UnknownWorkspace';
    static errorMessage = errorMessages[UnknownWorkspace.errorCode];
    static statusCode = 404;
    constructor(cause?: unknown) {
        super(
            UnknownWorkspace.errorCode,
            UnknownWorkspace.errorMessage,
            UnknownWorkspace.statusCode,
            cause
        );
    }
}

export class PluginFailed extends PublicAPIError {
    static errorCode = 'PluginResultFailed';
    static errorMessage = errorMessages[PluginFailed.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(PluginFailed.errorCode, PluginFailed.errorMessage, PluginFailed.statusCode, cause);
    }
}

export class PluginResultNotAvailable extends PublicAPIError {
    static errorCode = 'PluginResultNotAvailable';
    static errorMessage = errorMessages[PluginResultNotAvailable.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            PluginResultNotAvailable.errorCode,
            PluginResultNotAvailable.errorMessage,
            PluginResultNotAvailable.statusCode,
            cause
        );
    }
}

export class CannotRemoveDefaultPolicy extends PublicAPIError {
    static errorCode = 'CannotRemoveDefaultPolicy';
    static errorMessage = errorMessages[CannotRemoveDefaultPolicy.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            CannotRemoveDefaultPolicy.errorCode,
            CannotRemoveDefaultPolicy.errorMessage,
            CannotRemoveDefaultPolicy.statusCode,
            cause
        );
    }
}

export class CannotUnDefaultDefaultPolicy extends PublicAPIError {
    static errorCode = 'CannotUnDefaultDefaultPolicy';
    static errorMessage = errorMessages[CannotUnDefaultDefaultPolicy.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            CannotUnDefaultDefaultPolicy.errorCode,
            CannotRemoveDefaultPolicy.errorMessage,
            CannotRemoveDefaultPolicy.statusCode,
            cause
        );
    }
}

export class RepositoryCannotBeFound extends PublicAPIError {
    static errorCode = 'RepositoryCannotBeFound';
    static errorMessage = errorMessages[RepositoryCannotBeFound.errorCode];
    static statusCode = 404;
    constructor(cause?: unknown) {
        super(
            RepositoryCannotBeFound.errorCode,
            RepositoryCannotBeFound.errorMessage,
            RepositoryCannotBeFound.statusCode,
            cause
        );
    }
}

export class IntegrationNotSupported extends PublicAPIError {
    static errorCode = 'IntegrationNotSupported';
    static errorMessage = errorMessages[IntegrationNotSupported.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            IntegrationNotSupported.errorCode,
            IntegrationNotSupported.errorMessage,
            IntegrationNotSupported.statusCode,
            cause
        );
    }
}

export class IntegrationDoesNotExist extends PublicAPIError {
    static errorCode = 'IntegrationDoesNotExist';
    static errorMessage = errorMessages[IntegrationDoesNotExist.errorCode];
    static statusCode = 404;
    constructor(cause?: unknown) {
        super(
            IntegrationDoesNotExist.errorCode,
            IntegrationDoesNotExist.errorMessage,
            IntegrationDoesNotExist.statusCode,
            cause
        );
    }
}

export class IntegrationTokenExpired extends PublicAPIError {
    static errorCode = 'IntegrationTokenExpired';
    static errorMessage = errorMessages[IntegrationTokenExpired.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            IntegrationTokenExpired.errorCode,
            IntegrationTokenExpired.errorMessage,
            IntegrationTokenExpired.statusCode,
            cause
        );
    }
}

export class IntegrationTokenRefreshFailed extends PublicAPIError {
    static errorCode = 'IntegrationTokenRefreshFailed';
    static errorMessage = errorMessages[IntegrationTokenRefreshFailed.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            IntegrationTokenRefreshFailed.errorCode,
            IntegrationTokenRefreshFailed.errorMessage,
            IntegrationTokenRefreshFailed.statusCode,
            cause
        );
    }
}

export class DuplicateIntegration extends PublicAPIError {
    static errorCode = 'DuplicateIntegration';
    static errorMessage = errorMessages[DuplicateIntegration.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            DuplicateIntegration.errorCode,
            DuplicateIntegration.errorMessage,
            DuplicateIntegration.statusCode,
            cause
        );
    }
}

export class ProjectDoesNotExist extends PublicAPIError {
    static errorCode = 'ProjectDoesNotExist';
    static errorMessage = errorMessages[ProjectDoesNotExist.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            ProjectDoesNotExist.errorCode,
            ProjectDoesNotExist.errorMessage,
            ProjectDoesNotExist.statusCode,
            cause
        );
    }
}

export class IntegrationWrongTokenType extends PublicAPIError {
    static errorCode = 'IntegrationWrongTokenType';
    static errorMessage = errorMessages[IntegrationWrongTokenType.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            IntegrationWrongTokenType.errorCode,
            IntegrationWrongTokenType.errorMessage,
            IntegrationWrongTokenType.statusCode,
            cause
        );
    }
}

export class FailedToRetrieveReposFromProvider extends PublicAPIError {
    static errorCode = 'FailedToRetrieveReposFromProvider';
    static errorMessage = errorMessages[FailedToRetrieveReposFromProvider.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            FailedToRetrieveReposFromProvider.errorCode,
            FailedToRetrieveReposFromProvider.errorMessage,
            FailedToRetrieveReposFromProvider.statusCode,
            cause
        );
    }
}

export class IntegrationTokenRetrievalFailed extends PublicAPIError {
    static errorCode = 'IntegrationTokenRetrievalFailed';
    static errorMessage = errorMessages[IntegrationTokenRetrievalFailed.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            IntegrationTokenRetrievalFailed.errorCode,
            IntegrationTokenRetrievalFailed.errorMessage,
            IntegrationTokenRetrievalFailed.statusCode,
            cause
        );
    }
}

export class IntegrationInvalidToken extends PublicAPIError {
    static errorCode = 'IntegrationInvalidToken';
    static errorMessage = errorMessages[IntegrationInvalidToken.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            IntegrationInvalidToken.errorCode,
            IntegrationInvalidToken.errorMessage,
            IntegrationInvalidToken.statusCode,
            cause
        );
    }
}

export class AccountNotActivated extends PublicAPIError {
    static errorCode = 'AccountNotActivated';
    static errorMessage = errorMessages[AccountNotActivated.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            AccountNotActivated.errorCode,
            AccountNotActivated.errorMessage,
            AccountNotActivated.statusCode,
            cause
        );
    }
}

export class SocialConnectionTypeNotSupported extends PublicAPIError {
    static errorCode = 'SocialConnectionTypeNotSupported';
    static errorMessage = errorMessages[SocialConnectionTypeNotSupported.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            SocialConnectionTypeNotSupported.errorCode,
            SocialConnectionTypeNotSupported.errorMessage,
            SocialConnectionTypeNotSupported.statusCode,
            cause
        );
    }
}

export class PersonalOrgCannotBeModified extends PublicAPIError {
    static errorCode = 'PersonalOrgCannotBeModified';
    static errorMessage = errorMessages[PersonalOrgCannotBeModified.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            PersonalOrgCannotBeModified.errorCode,
            PersonalOrgCannotBeModified.errorMessage,
            PersonalOrgCannotBeModified.statusCode,
            cause
        );
    }
}

export class FailedToCreateApiKey extends PublicAPIError {
    static errorCode = 'FailedToCreateApiKey';
    static errorMessage = errorMessages[FailedToCreateApiKey.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            FailedToCreateApiKey.errorCode,
            FailedToCreateApiKey.errorMessage,
            FailedToCreateApiKey.statusCode,
            cause
        );
    }
}

export class FailedToAuthenticateSocialAccount extends PublicAPIError {
    static errorCode = 'FailedToCreateSocialAccount';
    static errorMessage = errorMessages[FailedToAuthenticateSocialAccount.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            FailedToAuthenticateSocialAccount.errorCode,
            FailedToAuthenticateSocialAccount.errorMessage,
            FailedToAuthenticateSocialAccount.statusCode,
            cause
        );
    }
}

export class InvitationExpired extends PublicAPIError {
    static errorCode = 'InvitationExpired';
    static errorMessage = errorMessages[InvitationExpired.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            InvitationExpired.errorCode,
            InvitationExpired.errorMessage,
            InvitationExpired.statusCode,
            cause
        );
    }
}

export class EmailAlreadyExists extends PublicAPIError {
    static errorCode = 'EmailAlreadyExists';
    static errorMessage = errorMessages[EmailAlreadyExists.errorCode];
    static statusCode = 409;
    constructor(cause?: unknown) {
        super(
            EmailAlreadyExists.errorCode,
            EmailAlreadyExists.errorMessage,
            EmailAlreadyExists.statusCode,
            cause
        );
    }
}

export class AlreadyExists extends PublicAPIError {
    static errorCode = 'AlreadyExists';
    static errorMessage = errorMessages[AlreadyExists.errorCode];
    static statusCode = 409;
    constructor(cause?: unknown) {
        super(AlreadyExists.errorCode, AlreadyExists.errorMessage, AlreadyExists.statusCode, cause);
    }
}

export class UserDoesNotExist extends PublicAPIError {
    static errorCode = 'UserDoesNotExist';
    static errorMessage = errorMessages[UserDoesNotExist.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            UserDoesNotExist.errorCode,
            UserDoesNotExist.errorMessage,
            UserDoesNotExist.statusCode,
            cause
        );
    }
}

export class UnsubscriptionTokenInvalidOrExpired extends PublicAPIError {
    static errorCode = 'UnsubscriptionTokenInvalidOrExpired';
    static errorMessage = errorMessages[UnsubscriptionTokenInvalidOrExpired.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            UnsubscriptionTokenInvalidOrExpired.errorCode,
            UnsubscriptionTokenInvalidOrExpired.errorMessage,
            UnsubscriptionTokenInvalidOrExpired.statusCode,
            cause
        );
    }
}

export class NotAMember extends PublicAPIError {
    static errorCode = 'NotAMember';
    static errorMessage = errorMessages[NotAMember.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(NotAMember.errorCode, NotAMember.errorMessage, NotAMember.statusCode, cause);
    }
}

export class CannotLeaveAsOwner extends PublicAPIError {
    static errorCode = 'CannotLeaveAsLastOwner';
    static errorMessage = errorMessages[CannotLeaveAsOwner.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            CannotLeaveAsOwner.errorCode,
            CannotLeaveAsOwner.errorMessage,
            CannotLeaveAsOwner.statusCode,
            cause
        );
    }
}

export class CannotRevokeOwnMembership extends PublicAPIError {
    static errorCode = 'CannotRevokeOwnMembership';
    static errorMessage = errorMessages[CannotRevokeOwnMembership.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            CannotRevokeOwnMembership.errorCode,
            CannotRevokeOwnMembership.errorMessage,
            CannotRevokeOwnMembership.statusCode,
            cause
        );
    }
}

export class InvitationInvalidOrExpired extends PublicAPIError {
    static errorCode = 'InvitationInvalidOrExpired';
    static errorMessage = errorMessages[InvitationInvalidOrExpired.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            InvitationInvalidOrExpired.errorCode,
            InvitationInvalidOrExpired.errorMessage,
            InvitationInvalidOrExpired.statusCode,
            cause
        );
    }
}

export class EntityNotFound extends PublicAPIError {
    static errorCode = 'EntityNotFound';
    static errorMessage = errorMessages[EntityNotFound.errorCode];
    static statusCode = 404;
    constructor(cause?: unknown) {
        super(
            EntityNotFound.errorCode,
            EntityNotFound.errorMessage,
            EntityNotFound.statusCode,
            cause
        );
    }
}

export class IntegrationTokenMissingPermissions extends PublicAPIError {
    static errorCode = 'IntegrationIntegrationTokenMissingPermissions';
    static errorMessage = errorMessages[IntegrationTokenMissingPermissions.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            IntegrationTokenMissingPermissions.errorCode,
            IntegrationTokenMissingPermissions.errorMessage,
            IntegrationTokenMissingPermissions.statusCode,
            cause
        );
    }
}

export class FailedToSendPasswordResetEmail extends PublicAPIError {
    static errorCode = 'FailedToSendPasswordResetEmail';
    static errorMessage = errorMessages[FailedToSendPasswordResetEmail.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            FailedToSendPasswordResetEmail.errorCode,
            FailedToSendPasswordResetEmail.errorMessage,
            FailedToSendPasswordResetEmail.statusCode,
            cause
        );
    }
}

export class FailedToSendOrganizationInviteEmail extends PublicAPIError {
    static errorCode = 'FailedToSendOrganizationInviteEmail';
    static errorMessage = errorMessages[FailedToSendOrganizationInviteEmail.errorCode];
    static statusCode = 500;
    constructor(cause?: unknown) {
        super(
            FailedToSendOrganizationInviteEmail.errorCode,
            FailedToSendOrganizationInviteEmail.errorMessage,
            EntityNotFound.statusCode,
            cause
        );
    }
}

export class InternalError extends PrivateAPIError {
    constructor(errorCode: string, errorMessage: string, cause?: unknown) {
        super(
            'InternalError',
            'We encountered a problem while processing your request.',
            500,
            errorCode,
            errorMessage,
            cause
        );
    }
}

export class RabbitMQError extends PrivateAPIError {
    constructor(cause?: unknown) {
        super(
            'InternalError',
            'We encountered a problem while processing your request.',
            500,
            'RabbitMQError',
            'An error occured while communicating or setting up communication with rabbitmq.',
            cause
        );
    }
}
