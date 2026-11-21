import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import { User } from "src/base_modules/users/users.entity";

import { MemberRole } from "./memberships/orgMembership.types";

/********************************************/
/*             Database entities            */
/********************************************/

export class OrganizationMetaData {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  created_on!: Date;
  @ApiProperty()
  vcs_integrations_added!: boolean;
  @ApiProperty()
  integrations_added!: boolean;
  @ApiProperty()
  projects_added!: boolean;
  @ApiProperty()
  analyses_started!: boolean;
}

export class OrganizationInfoForInvitee {
  @ApiProperty()
  @Expose()
  id!: string;
  @ApiProperty()
  @Expose()
  name!: string;
  @ApiProperty()
  @Expose()
  description!: string;
  @ApiProperty()
  @Expose()
  color_scheme!: string;
  @ApiProperty()
  @Expose()
  created_on!: Date;
  @ApiProperty({ required: false })
  @Expose()
  created_by?: Partial<User>;
  @ApiProperty({ required: false })
  @Expose()
  invite_created_by?: Partial<User>;
  @ApiProperty()
  @Expose()
  invite_created_on!: Date;
  @ApiProperty()
  @Expose()
  role!: MemberRole;
  @ApiProperty()
  @Expose()
  number_of_members!: number;
}

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class OrganizationCreateBody {
  @ApiProperty()
  @IsNotEmpty()
  @Length(1, 50)
  name!: string;

  @ApiProperty()
  @IsNotEmpty()
  @Length(1, 250)
  description!: string;

  @ApiProperty()
  @IsDefined()
  color_scheme!: string;
}

export class JoinOrgCreateBody {
  @ApiProperty()
  @IsNotEmpty()
  token!: string;

  @ApiProperty()
  @IsNotEmpty()
  email_digest!: string;
}

export class InviteeInfoQuery {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  user_email_hash!: string;
}

/** Days allowed per severity, each a whole number of days or null for none */
export class ServiceLevelTargetDaysBody {
  @ApiProperty({ required: false, nullable: true, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  critical?: number | null;

  @ApiProperty({ required: false, nullable: true, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  high?: number | null;

  @ApiProperty({ required: false, nullable: true, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  medium?: number | null;

  @ApiProperty({ required: false, nullable: true, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  low?: number | null;
}

export class OrganizationSettingsUpdateBody {
  @ApiProperty({ required: false })
  auto_resolve_tickets?: boolean;

  /** Days after which a project's current analysis counts as stale */
  @ApiProperty({ required: false, minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  freshness_threshold_days?: number;

  /** Whether new tickets get due dates from the service level targets */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  service_level_targets_enabled?: boolean;

  /** Days per severity to change; null removes that severity's target */
  @ApiProperty({ required: false, type: () => ServiceLevelTargetDaysBody })
  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceLevelTargetDaysBody)
  service_level_targets?: ServiceLevelTargetDaysBody;
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
