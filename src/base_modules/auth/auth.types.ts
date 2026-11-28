import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, Length } from "class-validator";

import type { OrganizationTokenPrincipal } from "../organizations/tokens/organization-token.types";

/** JWT payload structure for tokens */
export interface JwtPayload {
  userId: string;
  roles: ROLE[];
  activated?: boolean | undefined;
}

export class AuthenticatedUser {
  userId!: string;
  roles!: ROLE[];
  activated!: boolean;
  apiKey?: string | undefined;
  /** Set when the request carries an Organization token; userId is then the token's id. */
  organizationToken?: OrganizationTokenPrincipal | undefined;

  constructor(
    userId: string,
    roles: ROLE[],
    activated: boolean,
    apiKey?: string,
  ) {
    this.userId = userId;
    this.roles = roles;
    this.activated = activated;
    this.apiKey = apiKey;
  }

  hasRole(role: ROLE): boolean {
    return this.roles.includes(role);
  }
}

export enum ROLE {
  USER = "ROLE_USER",
  ADMIN = "ROLE_ADMIN",
}

/** The tokens of a sign-in, which the API hands out only as cookies (ADR 0025). */
export interface SignInTokens {
  accessToken: string;
  accessExpiry: Date;
  refreshToken: string;
  refreshExpiry: Date;
}

/** What a sign-in, refresh or password change tells the app; the tokens themselves are in cookies. */
export class SessionExpiryResponse {
  @ApiProperty({ description: "When the access token in the cookie ends" })
  token_expiry!: Date;

  @ApiProperty({ description: "Seven days after sign-in; rotation keeps it" })
  refresh_token_expiry!: Date;
}

/** The answer the app gets for a sign-in's tokens. */
export function sessionExpiryOf(tokens: SignInTokens): SessionExpiryResponse {
  return {
    token_expiry: tokens.accessExpiry,
    refresh_token_expiry: tokens.refreshExpiry,
  };
}

/********************************************/
/*              HTTP Post bodies            */
/********************************************/

export class UserPasswordResetRequestBody {
  @ApiProperty({ description: "Email" })
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}

export class UserPasswordResetBody {
  @ApiProperty({ description: "The new password (min: 10, max: 75)" })
  @IsNotEmpty()
  @Length(10, 75)
  new_password!: string;

  @ApiProperty({ description: "Password confirmation (min: 10, max: 75)" })
  @IsNotEmpty()
  @Length(10, 75)
  new_password_confirmation!: string;

  @ApiProperty({ description: "The token sent via email" })
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: "The user id hash sent via email" })
  @IsNotEmpty()
  user_id_hash!: string;
}

export class AuthenticateBody {
  @ApiProperty({ description: "Email" })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: "Password" })
  @IsNotEmpty()
  password!: string;
}
