import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    OneToMany,
    Relation,
    ManyToMany,
    JoinTable,
    ManyToOne,
    JoinColumn,
    Index
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { Integration } from '../../entity/codeclarity/Integration';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { OrganizationMemberships } from '../organizations/organization.memberships.entity';
import { Project } from '../../entity/codeclarity/Project';
import { Analyzer } from '../../entity/codeclarity/Analyzer';
import { Analysis } from '../../entity/codeclarity/Analysis';
import { Policy } from '../../entity/codeclarity/Policy';
import { File } from '../../entity/codeclarity/File';
import { Email } from '../../entity/codeclarity/Email';
import { Invitation } from '../../entity/codeclarity/Invitation';

export enum SocialType {
    GITHUB = 'GITHUB',
    GITLAB = 'GITLAB'
}

@Entity()
export class User {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100
    })
    first_name: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100
    })
    last_name: string;

    @ApiProperty()
    @Expose()
    @Index({ unique: true })
    @Column({
        length: 100
    })
    handle: string;

    @ApiProperty()
    @Expose()
    @Index({ unique: true })
    @Column({
        length: 100
    })
    email: string;

    @ApiProperty()
    @Expose()
    @Column()
    social: boolean;

    @ApiProperty()
    @Expose()
    @Column({ nullable: true })
    social_register_type?: SocialType;

    @ApiProperty()
    @Expose()
    @Column()
    setup_done: boolean;

    @ApiProperty()
    @Expose()
    @Column()
    activated: boolean;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100,
        nullable: true
    })
    avatar_url?: string;

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    created_on: Date;

    @ApiProperty()
    @Expose()
    @Column()
    registration_verified: boolean;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100
    })
    password: string;

    @ApiProperty()
    @Expose()
    @Column({ nullable: true })
    setup_temporary_conf?: string;

    // Foreign keys
    @OneToMany(() => Organization, (organization) => organization.created_by)
    organizations_created: Relation<Organization[]>;

    @OneToMany(() => Policy, (policy) => policy.created_by)
    policies: Relation<Policy[]>;

    @OneToMany(() => Analyzer, (analyzer) => analyzer.created_by)
    analyzers_created: Relation<Analyzer[]>;

    @OneToMany(() => Invitation, (invitation) => invitation.user)
    invitations: Relation<Invitation[]>;

    @OneToMany(() => OrganizationMemberships, (membership) => membership.organization)
    organizationMemberships: Relation<OrganizationMemberships[]>;

    @ManyToMany(() => Organization, (organization) => organization.owners)
    ownerships: Relation<Organization[]>;

    @ManyToMany(() => Integration, (integration) => integration.users)
    @JoinTable()
    integrations?: Relation<User[]>;

    @Column({ nullable: true })
    oauth_integration?: string;

    @Column({ nullable: true })
    social_id?: string;

    @ApiProperty()
    @Expose({ name: 'default_org' })
    @ManyToOne(() => Organization, (organization) => organization.default)
    @JoinColumn({ name: 'default_org' })
    default_org: Relation<Organization>;

    @OneToMany(() => Project, (project) => project.added_by)
    projects_imported: Relation<Project[]>;

    @OneToMany(() => Integration, (integration) => integration.owner)
    integrations_owned: Relation<Integration[]>;

    @OneToMany(() => Analysis, (analysis) => analysis.created_by)
    analyses: Relation<Analysis[]>;

    @OneToMany(() => File, (file) => file.added_by)
    files_imported: Relation<File[]>;

    @OneToMany(() => Email, (email) => email.user)
    mails: Relation<Email[]>;
}
