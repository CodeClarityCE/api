import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  Length,
  ValidateBy,
} from "class-validator";

// The frontend copies OrganizationTokenScope in frontend/src/codeclarity_components/organizations/tokens/organization_token.entity.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum OrganizationTokenScope {
  READ = "read",
  ANALYZE = "analyze",
}

/** Whether a token with `granted` may do what `required` allows; analyze includes read. */
export function scopeIncludes(
  granted: OrganizationTokenScope,
  required: OrganizationTokenScope,
): boolean {
  return (
    granted === required ||
    (granted === OrganizationTokenScope.ANALYZE &&
      required === OrganizationTokenScope.READ)
  );
}

/** Every secret starts with this, so the auth guard can tell it from a JWT. */
export const ORGANIZATION_TOKEN_PREFIX = "ccot_";

/** A date string that lies in the future, so no token is issued already expired. */
function IsFutureDate(): PropertyDecorator {
  return ValidateBy({
    name: "isFutureDate",
    validator: {
      validate: (value: unknown): boolean =>
        typeof value === "string" && new Date(value).getTime() > Date.now(),
      defaultMessage: (): string => "$property must be a date in the future",
    },
  });
}

export class OrganizationTokenCreateBody {
  @ApiProperty({ description: "A name to recognise the token by" })
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: OrganizationTokenScope })
  @IsEnum(OrganizationTokenScope)
  scope!: OrganizationTokenScope;

  @ApiProperty({ description: "When the token stops working (ISO 8601)" })
  @IsDateString()
  @IsFutureDate()
  expires_on!: string;
}

/** A token as its creator sees it once, with its secret. */
export class CreatedOrganizationToken {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty({ enum: OrganizationTokenScope })
  @Expose()
  scope!: OrganizationTokenScope;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  created_on!: Date;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  expires_on!: Date;

  @ApiProperty({ description: "Shown only in this response" })
  @Expose()
  secret!: string;
}

/** A token as an admin lists it: never its secret. */
export class OrganizationTokenSummary {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty({ enum: OrganizationTokenScope })
  @Expose()
  scope!: OrganizationTokenScope;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  created_on!: Date;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  expires_on!: Date;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "Null once the creator's account is deleted",
  })
  @Expose()
  created_by_email!: string | null;
}

/** Who a request made with an Organization token acts as. */
export interface OrganizationTokenPrincipal {
  id: string;
  name: string;
  organizationId: string;
  scope: OrganizationTokenScope;
}
