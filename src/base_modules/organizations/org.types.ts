import { Expose, Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OptionalTransform } from 'src/transformers/transformer';
import { TeamMember } from '../users/teamMember.types';
import { MemberRole } from './orgMembership.types';
import { User } from 'src/base_modules/users/users.entity';

/********************************************/
/*             Database entities            */
/********************************************/

export class OrganizationMetaData {
    @ApiProperty()
    id: string;
    @ApiProperty()
    created_on: Date;
    @ApiProperty()
    vcs_integrations_added: boolean;
    @ApiProperty()
    integrations_added: boolean;
    @ApiProperty()
    projects_added: boolean;
    @ApiProperty()
    analyses_started: boolean;
}

export class OrganizationInfoForInvitee {
    @ApiProperty()
    @Expose()
    id: string;
    @ApiProperty()
    @Expose()
    name: string;
    @ApiProperty()
    @Expose()
    description: string;
    @ApiProperty()
    @Expose()
    color_scheme: string;
    @ApiProperty()
    @Expose()
    created_on: Date;
    @ApiProperty({ required: false })
    @Expose()
    created_by?: Partial<User>;
    @ApiProperty({ required: false })
    @Expose()
    invite_created_by?: Partial<User>;
    @ApiProperty()
    @Expose()
    invite_created_on: Date;
    @ApiProperty()
    @Expose()
    role: MemberRole;
    @ApiProperty()
    @Expose()
    number_of_members: number;
}

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class OrganizationCreateBody {
    @ApiProperty()
    @IsNotEmpty()
    @Length(1, 50)
    name: string;

    @ApiProperty()
    @IsNotEmpty()
    @Length(1, 250)
    description: string;

    @ApiProperty()
    @IsDefined()
    color_scheme: string;
}

export class JoinOrgCreateBody {
    @ApiProperty()
    @IsNotEmpty()
    token: string;

    @ApiProperty()
    @IsNotEmpty()
    email_digest: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface OrganizationCreate {
    name: string;
    description: string;
    created_on: Date;
    created_by: string;
    personal: boolean;
    color_scheme: string;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface OrganizationUpdate extends OrganizationCreate {}
