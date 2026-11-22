import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from "class-validator";

// import { OptionalTransform } from 'src/transformers/transformer';

/********************************************/
/*                   Enums                  */
/********************************************/

export enum LicensePolicyType {
  WHITELIST = "WHITELIST",
  BLACKLIST = "BLACKLIST",
}

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class LicensePolicyCreateBody {
  @IsNotEmpty()
  @Length(5, 50)
  name!: string;

  @IsString()
  @Length(0, 250)
  description!: string;

  @IsNotEmpty()
  @IsEnum(LicensePolicyType)
  type!: LicensePolicyType;

  @IsArray()
  licenses!: string[];

  @IsBoolean()
  default!: boolean;
}

/********************************************/
/*             HTTP Patch bodies            */
/********************************************/

export class LicensePolicyPatchBody {
  @IsOptional()
  @IsNotEmpty()
  @Length(5, 50)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 250)
  description?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsEnum(LicensePolicyType)
  type?: LicensePolicyType;

  @IsOptional()
  @IsArray()
  licenses?: string[];

  @IsOptional()
  @IsBoolean()
  default?: boolean;
}
