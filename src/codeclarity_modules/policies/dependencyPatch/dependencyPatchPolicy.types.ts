import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

import {
    DefaultablePolicyCreate,
    DefaultablePolicyUpdate,
    PolicyCreate,
    PolicyType,
    PolicyUpdate
} from '../policy.types';

/********************************************/
/*                   Enums                  */
/********************************************/

export enum FullFixVersionSelection {
    SELECT_NEWEST = 'SELECT_NEWEST',
    SELECT_CLOSEST_TO_INSTALLED = 'SELECT_CLOSEST_TO_INSTALLED'
}

export enum PartialFixVersionSelection {
    SELECT_LOWEST_MAX_SEVERITY = 'SELECT_LOWEST_MAX_SEVERITY',
    SELECT_LOWEST_AVERAGE_SEVERITY = 'SELECT_LOWEST_AVERAGE_SEVERITY'
}

/********************************************/
/*             Database entities            */
/********************************************/

export class DependencyPatchPolicy {
    @ApiProperty()
    @Expose()
    name!: string;

    @ApiProperty()
    @Expose()
    description!: string;

    @ApiProperty()
    @Expose()
    allow_downgrade!: boolean;

    @ApiProperty()
    @Expose()
    full_fix_version_selection_preference!: string;

    @ApiProperty()
    @Expose()
    partial_fix_version_selection_preference!: string;

    @ApiProperty()
    @Expose()
    default!: boolean;

    // @ApiProperty()
    // @Expose()
    // @OptionalTransform((v) => new TeamMember(v))
    // created_by?: TeamMember;

    @ApiProperty()
    @Expose()
    @Type(() => Date)
    created_on!: Date;

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

export class DependencyPatchPolicyCreateBody {
    @IsNotEmpty()
    @Length(5, 50)
    name!: string;

    @IsString()
    @Length(10, 250)
    description!: string;

    @IsBoolean()
    allow_downgrade!: boolean;

    @IsNotEmpty()
    @IsEnum(FullFixVersionSelection)
    full_fix_version_selection_preference!: FullFixVersionSelection;

    @IsNotEmpty()
    @IsEnum(PartialFixVersionSelection)
    partial_fix_version_selection_preference!: PartialFixVersionSelection;

    @IsBoolean()
    default!: boolean;
}

/********************************************/
/*             HTTP Patch bodies            */
/********************************************/

export class DependencyPatchPolicyPatchBody {
    @IsOptional()
    @IsNotEmpty()
    @Length(5, 50)
    name?: string;

    @IsOptional()
    @IsString()
    @Length(10, 250)
    description?: string;

    @IsOptional()
    @IsBoolean()
    allow_downgrade?: boolean;

    @IsOptional()
    @IsNotEmpty()
    @IsEnum(FullFixVersionSelection)
    full_fix_version_selection_preference?: FullFixVersionSelection;

    @IsOptional()
    @IsNotEmpty()
    @IsEnum(PartialFixVersionSelection)
    partial_fix_version_selection_preference?: PartialFixVersionSelection;

    @IsOptional()
    @IsBoolean()
    default?: boolean;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface DependencyPatchPolicyCreate extends PolicyCreate, DefaultablePolicyCreate {
    name: string;
    description: string;
    default: boolean;
    allow_downgrade: boolean;
    full_fix_version_selection_preference: FullFixVersionSelection;
    partial_fix_version_selection_preference: PartialFixVersionSelection;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface DependencyPatchPolicyPatch extends PolicyUpdate, DefaultablePolicyUpdate {
    name?: string;
    description?: string;
    default?: boolean;
    allow_downgrade?: boolean;
    full_fix_version_selection_preference?: FullFixVersionSelection;
    partial_fix_version_selection_preference?: PartialFixVersionSelection;
}
