import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    Relation,
    OneToMany,
    ManyToOne
} from 'typeorm';
import type { Analysis } from '../analyses/analysis.entity';
import type { File } from '../file/file.entity';
import type { Integration } from '../integrations/integrations.entity';
import type { Organization } from '../organizations/organization.entity';
import type { User } from '../users/users.entity';

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
    id!: string;

    @Column('timestamptz')
    @ApiProperty()
    @Expose()
    added_on!: Date;

    @Column({
        length: 100,
        nullable: true
    })
    service_domain!: string;

    @Column()
    integration_type!: IntegrationType;

    @Column()
    integration_provider!: IntegrationProvider;

    @Column()
    invalid!: boolean;

    @Column('timestamptz', { nullable: true })
    expiry_date?: Date;

    @Column()
    downloaded!: boolean;

    @Column()
    default_branch!: string;

    @Column()
    @ApiProperty()
    @Expose()
    url!: string;

    @Column()
    @ApiProperty()
    @Expose()
    name!: string;

    @Column()
    @ApiProperty()
    @Expose()
    description!: string;

    @Column()
    @ApiProperty()
    @Expose()
    type!: IntegrationProvider;

    // Foreign keys
    @ManyToMany('Organization', 'projects')
    @ApiProperty()
    @Expose()
    organizations!: Relation<Organization[]>;

    @ApiProperty()
    @Expose()
    @OneToMany('Analysis', 'project')
    analyses!: Relation<Analysis[]>;

    @ManyToOne('Integration', 'projects')
    @ApiProperty()
    @Expose()
    integration!: Relation<Integration>;

    @ApiProperty()
    @Expose()
    @OneToMany('File', 'project')
    files!: Relation<File[]>;

    @ManyToOne('User', 'projects_imported')
    @ApiProperty()
    @Expose()
    added_by!: Relation<User>;
}
