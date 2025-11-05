import { IsNotEmpty, IsEmail, IsOptional, Length, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class UserCreateBody {
    @ApiProperty({ description: 'First name (min: 1, max: 50)', example: 'John' })
    @IsNotEmpty()
    @Length(1, 25)
    first_name!: string;

    @ApiProperty({ description: 'Last name (min: 1, max: 50)', example: 'Doe' })
    @IsNotEmpty()
    @Length(1, 50)
    last_name!: string;

    @ApiProperty({ description: 'Email address', example: 'johndoe@gmail.com' })
    @IsNotEmpty()
    @IsEmail()
    email!: string;

    @ApiProperty({ description: 'Handle (min: 5, max: 50)', example: 'JohnDoe' })
    @IsNotEmpty()
    @Length(5, 50)
    handle!: string;

    @ApiProperty({ description: 'Password (min: 10, max: 75)', example: 'someSuperSecurePassword' })
    @IsNotEmpty()
    @Length(10, 75)
    password!: string;

    @ApiProperty({
        description: 'Password confirmation (min: 10, max: 75)',
        example: 'someSuperSecurePassword'
    })
    @IsNotEmpty()
    @Length(10, 75)
    password_confirmation!: string;
}

export class UserCompleteSocialCreateBody {
    @ApiProperty()
    @IsNotEmpty()
    @Length(1, 25)
    first_name!: string;

    @ApiProperty()
    @IsNotEmpty()
    @Length(1, 50)
    last_name!: string;

    @ApiProperty()
    @IsNotEmpty()
    @Length(5, 50)
    handle!: string;
}

export class RegistrationConfirmationBody {
    @ApiProperty({ description: 'The token sent via email' })
    @IsNotEmpty()
    token!: string;

    @ApiProperty({ description: 'The userid hash sent via email.' })
    @IsNotEmpty()
    user_id_hash!: string;
}

/********************************************/
/*             HTTP Patch bodies            */
/********************************************/

export class UserPatchBody {
    @ApiProperty({ description: 'First name (min: 1, max: 50)', example: 'John' })
    @IsOptional()
    @IsNotEmpty()
    @Length(1, 25)
    first_name?: string;

    @ApiProperty({ description: 'Last name (min: 1, max: 50)', example: 'Doe' })
    @IsOptional()
    @IsNotEmpty()
    @Length(1, 50)
    last_name?: string;
}

export class UserPasswordPatchBody {
    @ApiProperty({ description: 'Password (min: 10, max: 75)', example: 'someSuperSecurePassword' })
    @IsNotEmpty()
    @Length(10, 75)
    password!: string;

    @ApiProperty({
        description: 'Password confirmation (min: 10, max: 75)',
        example: 'someSuperSecurePassword'
    })
    @IsNotEmpty()
    @Length(10, 75)
    password_confirmation!: string;

    @ApiProperty()
    @IsNotEmpty()
    old_password!: string;
}

export class ResendAccountRegEmailBody {
    @ApiProperty()
    @IsNotEmpty()
    @IsEmail()
    email!: string;
}

export class DeleteAccountBody {
    @ApiProperty()
    @IsOptional()
    @IsNotEmpty()
    password!: string;
}

export class DefaultOrgPatchBody {
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    default_org!: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export class UserCreate {
    first_name!: string;
    last_name!: string;
    email!: string;
    handle!: string;
    password!: string;
    social!: boolean;
    setup_done!: boolean;
    activated!: boolean;
    default_org?: string;
    personal_org?: string;
    registration_verified!: boolean;
    avatar_url!: string | undefined;
    created_on!: Date;
    oauth_integration?: string;
}

export class UserCreateSocial {
    email!: string;
    social!: boolean;
    setup_done!: boolean;
    activated!: boolean;
    social_register_type!: SocialType;
    social_id!: string;
    avatar_url!: string | undefined;
    created_on!: Date;
}

export class UserCompleteSocialCreate {
    first_name!: string;
    last_name!: string;
    handle!: string;
    setup_done!: boolean;
}

export class UserCreateSocialFull {
    first_name!: string;
    last_name!: string;
    handle!: string;
    email!: string;
    setup_done!: boolean;
}

export abstract class SocialAccountSetupCreate {
    access_token!: string;
    refresh_token?: string;
}

export class GithubSocialAccountSetupCreate extends SocialAccountSetupCreate {}

export class GitlabSocialAccountSetupCreate extends SocialAccountSetupCreate {
    integration_base_url!: string;
    expiry_date!: Date;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export class UserPatch {
    first_name?: string;
    last_name?: string;
    handle?: string;
}

export class UserPasswordPatchCreate {
    password!: string;
}

export class UserUpdate extends UserCreate {}

/********************************************/
/*                Other types               */
/********************************************/

export enum SocialType {
    GITHUB = 'GITHUB',
    GITLAB = 'GITLAB'
}
