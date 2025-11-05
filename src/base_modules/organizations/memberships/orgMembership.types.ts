import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/********************************************/
/*                   Enums                  */
/********************************************/

export enum MemberRole {
    OWNER = 0,
    ADMIN = 1,
    MODERATOR = 2,
    USER = 3
}

export const memberRoleTextualMapping = new Map<MemberRole, string>([
    [MemberRole.OWNER, 'Owner'],
    [MemberRole.ADMIN, 'Admin'],
    [MemberRole.MODERATOR, 'Moderator'],
    [MemberRole.USER, 'User']
]);

export function getTextualRepOfMemberRole(action: MemberRole): string {
    if (memberRoleTextualMapping.has(action)) {
        return memberRoleTextualMapping.get(action)!;
    } else {
        return 'Unknown';
    }
}

/********************************************/
/*             Database entities            */
/********************************************/

export class OrgMembership {
    @Expose()
    @ApiProperty()
    id!: string;

    @Expose()
    @ApiProperty()
    role!: MemberRole;

    @Expose()
    @ApiProperty()
    @Type(() => Date)
    added_on!: Date;

    @Expose()
    @ApiProperty()
    added_by!: string;

    @Expose()
    @ApiProperty()
    @Type(() => Date)
    joined_on!: Date;

    @Expose()
    @ApiProperty()
    organization_id!: string;

    @Expose()
    @ApiProperty()
    user_id!: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export class OrganizationMembershipCreate {
    role!: MemberRole;
    added_on!: Date;
    added_by!: string;
    joined_on!: Date;
    organization_id!: string;
    user_id!: string;
}

export function isMemberRoleGreaterThan(memberRole1: MemberRole, memberRole2: MemberRole) {
    return memberRole1 < memberRole2;
}

export function isMemberRoleGreaterOrEqualTo(memberRole1: MemberRole, memberRole2: MemberRole) {
    return memberRole1 <= memberRole2;
}

export function isMemberRoleEqualThan(memberRole1: MemberRole, memberRole2: MemberRole) {
    return memberRole1 == memberRole2;
}

export function isMemberRoleLessThan(memberRole1: MemberRole, memberRole2: MemberRole) {
    return memberRole1 > memberRole2;
}

export function isMemberRoleLessOrEqualTo(memberRole1: MemberRole, memberRole2: MemberRole) {
    return memberRole1 >= memberRole2;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface OrganizationMembershipUpdate {
    role: MemberRole;
    added_on: Date;
    added_by: string;
    joined_on: Date;
}
