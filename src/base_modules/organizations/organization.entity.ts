import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    ManyToMany,
    JoinTable,
    Relation,
    OneToMany
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { OrganizationMemberships } from './memberships/organization.memberships.entity';
import type { User } from '../users/users.entity';
import type { Notification } from '../notifications/notification.entity';
import type { Integration } from '../integrations/integrations.entity';
import type { Log } from './log/log.entity';
import type { Policy } from '../../codeclarity_modules/policies/policy.entity';
import type { Project } from '../projects/project.entity';
import type { Analyzer } from '../analyzers/analyzer.entity';
import type { Analysis } from '../analyses/analysis.entity';
import type { Invitation } from './invitations/invitation.entity';

@Entity()
export class Organization {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100
    })
    name: string;

    @ApiProperty()
    @Expose()
    @Column('text')
    description: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 5
    })
    color_scheme: string;

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    created_on: Date;

    @ApiProperty()
    @Expose()
    @Column()
    personal: boolean;

    // Foreign keys
    @ApiProperty()
    @Expose()
    @ManyToOne('User', 'organizations_created')
    created_by: Relation<User>;

    @OneToMany('Invitation', 'organization')
    invitations?: Relation<Invitation[]>;

    @ApiProperty()
    @Expose()
    @OneToMany(() => OrganizationMemberships, (membership) => membership.organization)
    organizationMemberships: Relation<OrganizationMemberships[]>;

    @ManyToMany('User', 'ownerships')
    @JoinTable()
    owners?: Relation<User[]>;

    @OneToMany('User', 'default_org')
    default: Relation<User[]>;

    @ManyToMany('Notification', 'organizations')
    @JoinTable()
    notifications?: Relation<Notification[]>;

    @ApiProperty()
    @Expose()
    @ManyToMany('Integration', 'organizations')
    @JoinTable()
    integrations?: Relation<Integration[]>;

    @ManyToMany('Policy', 'organizations')
    @JoinTable()
    policies?: Relation<Policy[]>;

    @ApiProperty()
    @Expose()
    @ManyToMany('Project', 'organizations')
    @JoinTable()
    projects: Relation<Project[]>;

    @OneToMany('Analyzer', 'organization')
    analyzers: Relation<Analyzer[]>;

    @OneToMany('Analysis', 'organization')
    analyses: Relation<Analysis[]>;

    @OneToMany('Log', 'organization')
    logs: Relation<Log[]>;
}
