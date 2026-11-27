import { PublicAPIError } from "src/types/error.types";

const errorMessages = {
  InvitationOrgAlreadyExists:
    "An invitation for the user to join the organization already exists.",
} satisfies Record<string, string>;

export class InvitationOrgAlreadyExists extends PublicAPIError {
  static readonly errorCode = "InvitationOrgAlreadyExists";
  static errorMessage = errorMessages[InvitationOrgAlreadyExists.errorCode];
  static statusCode = 400;
  constructor(cause?: unknown) {
    super(
      InvitationOrgAlreadyExists.errorCode,
      InvitationOrgAlreadyExists.errorMessage,
      InvitationOrgAlreadyExists.statusCode,
      cause,
    );
  }
}
