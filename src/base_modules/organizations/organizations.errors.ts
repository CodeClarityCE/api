import { PublicAPIError } from "src/types/error.types";

export const errorMessages: { [key: string]: string } = {
    InvitationOrgAlreadyExists:
        'An invitation for the user to join the organization already exists.'
};

export class InvitationOrgAlreadyExists extends PublicAPIError {
    static errorCode = 'InvitationOrgAlreadyExists';
    static errorMessage = errorMessages[InvitationOrgAlreadyExists.errorCode];
    static statusCode = 400;
    constructor(cause?: unknown) {
        super(
            InvitationOrgAlreadyExists.errorCode,
            InvitationOrgAlreadyExists.errorMessage,
            InvitationOrgAlreadyExists.statusCode,
            cause
        );
    }
}
