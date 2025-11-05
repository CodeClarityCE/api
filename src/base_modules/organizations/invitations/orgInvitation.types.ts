import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';

import { MemberRole } from '../memberships/orgMembership.types';

/********************************************/
/*             Database entities            */
/********************************************/

export class Invitation {
    @ApiProperty()
    @Expose()
    id!: string;

    @ApiProperty()
    @Expose()
    @Type(() => Date)
    created_on!: Date;

    // @ApiProperty()
    // @Expose()
    // @OptionalTransform((v) => new TeamMember(v))
    // created_by?: TeamMember;

    @ApiProperty()
    @Expose()
    role!: MemberRole;

    @ApiProperty()
    @Expose()
    organization_id!: string;

    @ApiProperty()
    @Expose()
    user_email!: string;

    @ApiProperty()
    @Type(() => Date)
    @Expose()
    ttl!: Date;

    @Exclude({ toPlainOnly: true })
    user_email_digest!: string;

    @Exclude({ toPlainOnly: true })
    invite_token_digest!: string;
}

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class InviteCreateBody {
    @ApiProperty()
    @IsNotEmpty()
    @IsEmail()
    user_email!: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsEnum(MemberRole)
    role!: MemberRole;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface InvitationCreate {
    invite_token_digest: string;
    created_on: Date;
    created_by: string;
    role: MemberRole;
    organization_id: string;
    user_email: string;
    user_email_digest: string;
    ttl: Date;
}

export interface InvitationUpdate extends InvitationCreate {}
