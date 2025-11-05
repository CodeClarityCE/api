import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { OptionalTransform } from 'src/transformers/transformer';
import { MemberRole } from '../organizations/memberships/orgMembership.types';

export class TeamMember {
    @Expose()
    @ApiProperty()
    id!: string;

    @Expose()
    @ApiProperty()
    first_name!: string;

    @Expose()
    @ApiProperty()
    last_name!: string;

    @Expose()
    @ApiProperty()
    handle!: string;

    @Expose()
    @ApiProperty()
    email!: string;

    @Expose()
    @ApiProperty()
    role!: MemberRole;

    @Expose()
    @ApiProperty()
    @Type(() => Date)
    added_on!: Date;

    @Expose()
    @ApiProperty()
    // @OptionalTransform((v) => new TeamMember(v))
    added_by!: string;

    @Expose()
    @ApiProperty()
    @Type(() => Date)
    joined_on!: Date;

    @Expose()
    @ApiProperty()
    @OptionalTransform((v) => v)
    avatar_url?: string;

    @Expose()
    @ApiProperty()
    organization_id!: string;
}
