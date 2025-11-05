import { Expose } from 'class-transformer';
import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UnsubscriptionType {
    ALL_EMAILS = 'ALL_EMAILS',
    ORG_INVITES = 'ORG_INVITES'
}

export class AllEmailsUnsubscriptionForNonUserCreate {
    user_email!: string;
    unsubscription_type!: UnsubscriptionType;
}

export class OrgInvitesUnsubscriptionCreate {
    user_email!: string;
    user_id!: string;
    org_id!: string;
    unsubscription_type!: UnsubscriptionType;
}

export interface EmailUnsubBase {
    user_email: string;
    unsubscription_type: UnsubscriptionType;
}

export class AllEmailsUnsubscriptionForNonUser {
    @ApiProperty()
    @Expose()
    user_email!: string;

    @ApiProperty()
    @Expose()
    unsubscription_type!: UnsubscriptionType;
}

export class OrgInvitesUnsubscription {
    @ApiProperty()
    @Expose()
    user_email!: string;

    @ApiProperty()
    @Expose()
    user_id!: string;

    @ApiProperty()
    @Expose()
    org_id!: string;

    @ApiProperty()
    @Expose()
    unsubscription_type!: UnsubscriptionType;
}

export const ORG_ALL_WILDCARD = '*';
export interface UserEmailUnsubscriptionEdgeCreate {}

export class EmailUnsubscribePostBody {
    @IsNotEmpty()
    token!: string;

    @IsNotEmpty()
    email_digest!: string;
}
