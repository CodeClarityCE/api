import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum PolicyType {
    LICENSE_POLICY = 'LICENSE_POLICY',
    DEP_UPGRADE_POLICY = 'DEP_UPGRADE_POLICY',
    VULNERABILITY_POLICY = 'VULNERABILITY_POLICY'
}

export class DefaultablePolicy {
    @ApiProperty()
    @Expose()
    policy_type: PolicyType;

    @ApiProperty()
    @Expose()
    default: boolean;

    @ApiProperty()
    @Expose()
    organization_id: string;

    @ApiProperty()
    @Expose()
    created_by: string;

    @ApiProperty()
    @Expose()
    @Type(() => Date)
    created_on: Date;
}

export class Policy {
    @Expose()
    policy_type: PolicyType;

    @ApiProperty()
    @Expose()
    created_by: string;

    @ApiProperty()
    @Expose()
    @Type(() => Date)
    created_on: Date;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface PolicyCreate {
    policy_type: PolicyType;
    created_by: string;
    created_on: Date;
    organization_id: string;
}

export interface DefaultablePolicyCreate extends PolicyCreate {
    default: boolean;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface PolicyUpdate {}

export interface DefaultablePolicyUpdate {
    default?: boolean;
}
