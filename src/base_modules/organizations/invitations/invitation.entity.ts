import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Relation } from 'typeorm';
import type { Organization } from '../organization.entity';
import type { User } from '../../users/users.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { MemberRole } from '../memberships/organization.memberships.entity';

@Entity()
export class Invitation {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty()
    @Expose()
    @Column('timestamptz', { nullable: true })
    @Type(() => Date)
    created_on: Date;

    @ApiProperty()
    @Expose()
    @Column()
    role: MemberRole;

    @Column({
        length: 250
    })
    token_digest: string;

    @Column({
        length: 250
    })
    user_email_digest: string;

    @ApiProperty()
    @Column('timestamptz', { nullable: true })
    @Type(() => Date)
    @Expose()
    ttl: Date;

    @ApiProperty()
    @Expose()
    @ManyToOne('Organization', 'invitations')
    organization: Relation<Organization>;

    @ApiProperty()
    @Expose()
    @ManyToOne('User', 'invitations')
    user: Relation<User>;
}
