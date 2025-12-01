import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/** JWT payload structure for tokens */
export interface JwtPayload {
    userId: string;
    roles: ROLE[];
}

/** User object returned from JWT validation */
export interface JwtValidationResult {
    userId: string;
    roles: ROLE[];
}

export class AuthenticatedUser {
    userId!: string;
    roles!: ROLE[];
    activated!: boolean;
    apiKey?: string | undefined;

    constructor(userId: string, roles: ROLE[], activated: boolean, apiKey?: string) {
        this.userId = userId;
        this.roles = roles;
        this.activated = activated;
        this.apiKey = apiKey;
    }

    hasRole(role: ROLE): boolean {
        return this.roles.includes(role);
    }
}

export interface GithubAuthenticatedUser {
    github_user_id: string;
    email: string | undefined;
    access_token: string;
    refresh_token: undefined;
    avatar_url: string;
}

export interface GitlabAuthenticatedUser {
    gitlab_user_id: string;
    email: string | undefined;
    access_token: string;
    refresh_token: string;
    avatar_url: string;
}

export enum ROLE {
    USER = 'ROLE_USER',
    ADMIN = 'ROLE_ADMIN'
}

export class TokenResponse {
    @ApiProperty()
    token!: string;

    @ApiProperty()
    refresh_token!: string;

    @ApiProperty()
    token_expiry!: Date;

    @ApiProperty()
    refresh_token_expiry!: Date;
}

export class TokenRefreshResponse {
    @ApiProperty()
    token!: string;

    @ApiProperty()
    token_expiry!: Date;
}

/********************************************/
/*              HTTP Post bodies            */
/********************************************/

export class UserPasswordResetRequestBody {
    @ApiProperty({ description: 'Email' })
    @IsNotEmpty()
    email!: string;
}

export class UserPasswordResetBody {
    @ApiProperty({ description: 'The new password.' })
    @IsNotEmpty()
    new_password!: string;

    @ApiProperty({ description: 'Password confirmation' })
    @IsNotEmpty()
    new_password_confirmation!: string;

    @ApiProperty({ description: 'The token sent via email' })
    @IsNotEmpty()
    token!: string;

    @ApiProperty({ description: 'The user id hash sent via email' })
    @IsNotEmpty()
    user_id_hash!: string;
}

export class AuthenticateBody {
    @ApiProperty({ description: 'Email' })
    @IsNotEmpty()
    @IsEmail()
    email!: string;

    @ApiProperty({ description: 'Password' })
    @IsNotEmpty()
    password!: string;
}

export class Oauth2InitQuery {
    @ApiProperty({ description: 'State (used for csrf)' })
    @IsNotEmpty()
    state!: string;
}

export class Oauth2FinalizeBody {
    @ApiProperty({ description: 'The code provided by the oauth2 process.' })
    @IsNotEmpty()
    code!: string;
}

export class GithubAppUpdateQuery {
    @ApiProperty({ description: 'Installation ID' })
    @IsNotEmpty()
    installation_id!: string;

    @IsNotEmpty()
    setup_action!: string;
}
