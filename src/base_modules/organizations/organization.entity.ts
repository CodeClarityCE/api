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
import { User } from '../users/users.entity';
import { Notification } from '../notifications/notification.entity';
import { Integration } from '../integrations/integrations.entity';
import { Log } from './log/log.entity';
import { Policy } from '../../codeclarity_modules/policies/policy.entity';
import { Project } from '../projects/project.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { OrganizationMemberships } from './memberships/organization.memberships.entity';
import { Analyzer } from '../analyzers/analyzer.entity';
import { Analysis } from '../analyses/analysis.entity';
import { Invitation } from './invitations/invitation.entity';

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
    @ManyToOne(() => User, (user) => user.organizations_created)
    created_by: Relation<User>;

    @OneToMany(() => Invitation, (invitation) => invitation.organization)
    invitations?: Relation<Invitation[]>;

    @ApiProperty()
    @Expose()
    @OneToMany(() => OrganizationMemberships, (membership) => membership.organization)
    organizationMemberships: Relation<OrganizationMemberships[]>;

    @ManyToMany(() => User, (user) => user.ownerships)
    @JoinTable()
    owners?: Relation<User[]>;

    @OneToMany(() => User, (user) => user.default_org)
    default: Relation<User[]>;

    @ManyToMany(() => Notification, (notification) => notification.organizations)
    @JoinTable()
    notifications?: Relation<Notification[]>;

    @ApiProperty()
    @Expose()
    @ManyToMany(() => Integration, (integration) => integration.organizations)
    @JoinTable()
    integrations?: Relation<Integration[]>;

    @ManyToMany(() => Policy, (policy) => policy.organizations)
    @JoinTable()
    policies?: Relation<Policy[]>;

    @ApiProperty()
    @Expose()
    @ManyToMany(() => Project, (project) => project.organizations)
    @JoinTable()
    projects: Relation<Project[]>;

    @OneToMany(() => Analyzer, (analyzer) => analyzer.organization)
    analyzers: Relation<Analyzer[]>;

    @OneToMany(() => Analysis, (analysis) => analysis.organization)
    analyses: Relation<Analysis[]>;

    @OneToMany(() => Log, (log) => log.organization)
    logs: Relation<Log[]>;
}
