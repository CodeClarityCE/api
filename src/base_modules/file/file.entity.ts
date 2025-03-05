import { Entity, Column, PrimaryGeneratedColumn, Relation, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { User } from '../users/users.entity';
import { Project } from '../projects/project.entity';

@Entity()
export class File {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column('timestamptz')
    @ApiProperty()
    @Expose()
    added_on: Date;

    @Column()
    @ApiProperty()
    @Expose()
    type: string;

    @Column()
    @ApiProperty()
    @Expose()
    name: string;

    @ManyToOne(() => Project, (project) => project.files)
    @ApiProperty()
    @Expose()
    project: Relation<Project>;

    @ManyToOne(() => User, (user) => user.files_imported)
    @ApiProperty()
    @Expose()
    added_by: Relation<User>;
}
