import { ApiProperty } from "@nestjs/swagger";
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
