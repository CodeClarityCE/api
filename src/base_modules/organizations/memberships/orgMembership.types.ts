/********************************************/
/*                   Enums                  */
/********************************************/

export enum MemberRole {
  OWNER = 0,
  ADMIN = 1,
  MODERATOR = 2,
  USER = 3,
}

const memberRoleTextualMapping = new Map<MemberRole, string>([
  [MemberRole.OWNER, "Owner"],
  [MemberRole.ADMIN, "Admin"],
  [MemberRole.MODERATOR, "Moderator"],
  [MemberRole.USER, "User"],
]);

export function getTextualRepOfMemberRole(action: MemberRole): string {
  if (memberRoleTextualMapping.has(action)) {
    return memberRoleTextualMapping.get(action)!;
  } else {
    return "Unknown";
  }
}

export function isMemberRoleLessThan(
  memberRole1: MemberRole,
  memberRole2: MemberRole,
): boolean {
  return memberRole1 > memberRole2;
}
