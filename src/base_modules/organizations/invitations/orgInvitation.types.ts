import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsEmail, IsEnum, IsNotEmpty } from "class-validator";

import { MemberRole } from "../memberships/orgMembership.types";

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
/*              HTTP responses              */
/********************************************/

/** The user who sent an invitation. */
export class InvitationInviter {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  first_name!: string;

  @ApiProperty()
  @Expose()
  last_name!: string;

  @ApiProperty()
  @Expose()
  handle!: string;

  @ApiProperty()
  @Expose()
  email!: string;
}

/** An open invitation as the organization's invitations list shows it. */
export class InvitationListItem {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  created_on!: Date;

  @ApiProperty({ type: InvitationInviter, required: false })
  @Expose()
  @Type(() => InvitationInviter)
  created_by?: InvitationInviter;

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
  @Expose()
  @Type(() => Date)
  ttl!: Date;
}
