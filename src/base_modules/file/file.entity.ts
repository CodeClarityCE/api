import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Entity, Column, PrimaryGeneratedColumn, Relation, ManyToOne } from 'typeorm';

import type { Project } from '../projects/project.entity';
import type { User } from '../users/users.entity';

@Entity()
export class File {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id!: string;

    @Column('timestamptz')
    @ApiProperty()
    @Expose()
    added_on!: Date;

    @Column()
    @ApiProperty()
    @Expose()
    type!: string;

    @Column()
    @ApiProperty()
    @Expose()
    name!: string;

    @ManyToOne('Project', 'files')
    @ApiProperty()
    @Expose()
    project!: Relation<Project>;

    @ManyToOne('User', 'files_imported')
    @ApiProperty()
    @Expose()
    added_by!: Relation<User>;
}
