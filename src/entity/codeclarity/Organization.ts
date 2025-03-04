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
import { User } from '../../base_modules/users/users.entity';
import { Notification } from './Notification';
import { Integration } from './Integration';
import { Log } from './Log';
import { Policy } from './Policy';
import { Project } from './Project';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { OrganizationMemberships } from './OrganizationMemberships';
import { Analyzer } from './Analyzer';
import { Analysis } from './Analysis';
import { Invitation } from './Invitation';

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
    @ManyToOne(() => User, (user) => user.organizations_created)
    created_by: Relation<User>;

    @OneToMany(() => Invitation, (invitation) => invitation.organization)
    invitations?: Relation<Invitation[]>;

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
