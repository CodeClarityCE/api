import { Expose, Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length
} from 'class-validator';
import {
    DefaultablePolicyCreate,
    DefaultablePolicyUpdate,
    PolicyCreate,
    PolicyType,
    PolicyUpdate
} from '../policy.types';
import { ApiProperty } from '@nestjs/swagger';
// import { OptionalTransform } from 'src/transformers/transformer';
import { TeamMember } from '../../../base_modules/users/teamMember.types';

/********************************************/
/*                   Enums                  */
/********************************************/

export enum LicensePolicyType {
    WHITELIST = 'WHITELIST',
    BLACKLIST = 'BLACKLIST'
}

/********************************************/
/*             Database entities            */
/********************************************/

export class LicensePolicy {
    @ApiProperty()
    @Expose()
    name!: string;

    @ApiProperty()
    @Expose()
    description!: string;

    @ApiProperty()
    @Expose()
    type!: LicensePolicyType;

    @ApiProperty()
    @Expose()
    default!: boolean;

    @ApiProperty()
    @Expose()
    created_by?: TeamMember;

    @ApiProperty()
    @Expose()
    @Type(() => Date)
    created_on!: Date;

    @ApiProperty()
    @Expose()
    licenses!: string[];

    @ApiProperty()
    @Expose()
    organization_id!: string;

    @ApiProperty()
    @Expose()
    policy_type!: PolicyType;
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
    @Length(10, 250)
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

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface LicensePolicyCreate extends PolicyCreate, DefaultablePolicyCreate {
    name: string;
    description: string;
    type: LicensePolicyType;
    licenses: string[];
    default: boolean;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface LicensePolicyPatch extends PolicyUpdate, DefaultablePolicyUpdate {
    name?: string;
    description?: string;
    type?: LicensePolicyType;
    licenses?: string[];
    default?: boolean;
}
