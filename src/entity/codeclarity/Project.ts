import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    Relation,
    OneToMany,
    ManyToOne
} from 'typeorm';
import { Organization } from '../../base_modules/organizations/organization.entity';
import { Analysis } from './Analysis';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Integration } from './Integration';
import { User } from '../../base_modules/users/users.entity';
import { File } from './File';

export enum IntegrationType {
    VCS = 'VCS'
}

export enum IntegrationProvider {
    GITHUB = 'GITHUB',
    GITLAB = 'GITLAB',
    FILE = 'FILE'
}

@Entity()
export class Project {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column('timestamptz')
    @ApiProperty()
    @Expose()
    added_on: Date;

    @Column({
        length: 100,
        nullable: true
    })
    service_domain: string;

    @Column()
    integration_type: IntegrationType;

    @Column()
    integration_provider: IntegrationProvider;

    @Column()
    invalid: boolean;

    @Column('timestamptz', { nullable: true })
    expiry_date?: Date;

    @Column()
    downloaded: boolean;

    @Column()
    default_branch: string;

    @Column()
    @ApiProperty()
    @Expose()
    url: string;

    @Column()
    @ApiProperty()
    @Expose()
    name: string;

    @Column()
    @ApiProperty()
    @Expose()
    description: string;

    @Column()
    @ApiProperty()
    @Expose()
    type: IntegrationProvider;

    // Foreign keys
    @ManyToMany(() => Organization, (organization) => organization.projects)
    @ApiProperty()
    @Expose()
    organizations: Relation<Organization[]>;

    @ApiProperty()
    @Expose()
    @OneToMany(() => Analysis, (analysis) => analysis.project)
    analyses: Relation<Analysis[]>;

    @ManyToOne(() => Integration, (integration) => integration.projects)
    @ApiProperty()
    @Expose()
    integration: Relation<Integration>;

    @ApiProperty()
    @Expose()
    @OneToMany(() => File, (file) => file.project)
    files: Relation<File[]>;

    @ManyToOne(() => User, (user) => user.projects_imported)
    @ApiProperty()
    @Expose()
    added_by: Relation<User>;
}
