import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    Relation,
    ManyToOne,
    OneToMany
} from 'typeorm';
import { Organization } from '../../base_modules/organizations/organization.entity';
import { User } from '../../base_modules/users/users.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { RepositoryCache } from './RepositoryCache';
import { Project } from './Project';
import { Analysis } from './Analysis';

export enum IntegrationType {
    VCS = 'VCS'
}

export enum IntegrationProvider {
    GITHUB = 'GITHUB',
    GITLAB = 'GITLAB',
    FILE = 'FILE'
}

@Entity()
export class Integration {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 25
    })
    integration_type: IntegrationType;

    @ApiProperty()
    @Expose()
    @Column({
        length: 25
    })
    integration_provider: IntegrationProvider;

    @Column({
        length: 100
    })
    access_token: string;

    @ApiProperty()
    @Expose()
    @Column({
        length: 100,
        nullable: true
    })
    token_type?: string;

    @Column({
        length: 100,
        nullable: true
    })
    refresh_token?: string;

    @ApiProperty()
    @Expose()
    @Column('timestamptz', { nullable: true })
    expiry_date?: Date;

    @ApiProperty()
    @Expose()
    @Column()
    invalid: boolean;

    @ApiProperty()
    @Expose()
    @Column({
        length: 25
    })
    service_domain: string;

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    added_on: Date;

    @Column('timestamptz', { nullable: true })
    last_repository_sync: Date;

    // Foreign keys
    @ManyToMany(() => Organization, (organization) => organization.integrations)
    organizations: Relation<Organization[]>;

    @ManyToMany(() => User, (user) => user.integrations)
    users: Relation<User[]>;

    @ManyToOne(() => RepositoryCache, (repository) => repository.integration)
    repository_cache: Relation<RepositoryCache>;

    @OneToMany(() => Project, (project) => project.integration)
    projects: Relation<Project[]>;

    @OneToMany(() => Analysis, (analysis) => analysis.integration)
    analyses: Relation<Analysis[]>;

    @ManyToOne(() => User, (user) => user.integrations_owned)
    owner: Relation<User>;
}
