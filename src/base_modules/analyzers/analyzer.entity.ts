import { Entity, Column, PrimaryGeneratedColumn, OneToMany, Relation, ManyToOne } from 'typeorm';
import { StageBase } from '../analyses/analysis.entity';
import type { Analysis } from '../analyses/analysis.entity';
import type { Organization } from '../organizations/organization.entity';
import type { User } from '../users/users.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity()
export class Analyzer {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column({
        length: 25
    })
    @ApiProperty()
    @Expose()
    name: string;

    @Column()
    global: boolean;

    @Column('text')
    @ApiProperty()
    @Expose()
    description: string;

    @Column('timestamptz')
    @ApiProperty()
    @Expose()
    created_on: Date;

    @Column('jsonb')
    @ApiProperty()
    @Expose()
    steps: StageBase[][];

    // Foreign keys
    @OneToMany('Analysis', 'analyzer')
    analyses: Relation<Analysis[]>;

    @ManyToOne('Organization', 'analyzers')
    organization: Relation<Organization>;

    @ManyToOne('User', 'analyzers_created')
    created_by: Relation<User>;
}
