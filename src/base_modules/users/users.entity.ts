import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
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
import type { Policy } from '../../codeclarity_modules/policies/policy.entity';
import type { Analysis } from '../analyses/analysis.entity';
import type { Analyzer } from '../analyzers/analyzer.entity';
import type { Email } from '../email/email.entity';
import type { File } from '../file/file.entity';
import type { Integration } from '../integrations/integrations.entity';
import type { Invitation } from '../organizations/invitations/invitation.entity';
import { OrganizationMemberships } from '../organizations/memberships/organization.memberships.entity';
import type { Organization } from '../organizations/organization.entity';
import type { Project } from '../projects/project.entity';

export enum SocialType {
    GITHUB = 'GITHUB',
    GITLAB = 'GITLAB'
}

@Entity()
export class User {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100
    })
    first_name!: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100
    })
    last_name!: string;

    @ApiProperty()
    @Expose()
    @Index({ unique: true })
    @Column({
        length: 100
    })
    handle!: string;

    @ApiProperty()
    @Expose()
    @Index({ unique: true })
    @Column({
        length: 100
    })
    email!: string;

    @ApiProperty()
    @Expose()
    @Column()
    social!: boolean;

    @ApiProperty()
    @Expose()
    @Column({ nullable: true })
    social_register_type?: SocialType;

    @ApiProperty()
    @Expose()
    @Column()
    setup_done!: boolean;

    @ApiProperty()
    @Expose()
    @Column()
    activated!: boolean;

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
    created_on!: Date;

    @ApiProperty()
    @Expose()
    @Column()
    registration_verified!: boolean;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100
    })
    password!: string;

    @ApiProperty()
    @Expose()
    @Column({ nullable: true })
    setup_temporary_conf?: string;

    // Foreign keys
    @OneToMany('Organization', 'created_by')
    organizations_created!: Relation<Organization[]>;

    @OneToMany('Policy', 'created_by')
    policies!: Relation<Policy[]>;

    @OneToMany('Analyzer', 'created_by')
    analyzers_created!: Relation<Analyzer[]>;

    @OneToMany('Invitation', 'user')
    invitations!: Relation<Invitation[]>;

    @OneToMany('OrganizationMemberships', 'organization')
    organizationMemberships!: Relation<OrganizationMemberships[]>;

    @ManyToMany('Organization', 'owners')
    ownerships!: Relation<Organization[]>;

    @ManyToMany('Integration', 'users')
    @JoinTable()
    integrations?: Relation<Integration[]>;

    @Column({ nullable: true })
    oauth_integration?: string;

    @Column({ nullable: true })
    social_id?: string;

    @ApiProperty()
    @Expose({ name: 'default_org' })
    @ManyToOne('Organization', 'default')
    @JoinColumn({ name: 'default_org' })
    default_org!: Relation<Organization>;

    @OneToMany('Project', 'added_by')
    projects_imported!: Relation<Project[]>;

    @OneToMany('Integration', 'owner')
    integrations_owned!: Relation<Integration[]>;

    @OneToMany('Analysis', 'created_by')
    analyses!: Relation<Analysis[]>;

    @OneToMany('File', 'added_by')
    files_imported!: Relation<File[]>;

    @OneToMany('Email', 'user')
    mails!: Relation<Email[]>;
}
