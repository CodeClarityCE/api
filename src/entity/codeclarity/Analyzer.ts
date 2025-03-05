import { Entity, Column, PrimaryGeneratedColumn, OneToMany, Relation, ManyToOne } from 'typeorm';
import { Analysis, StageBase } from './Analysis';
import { Organization } from '../../base_modules/organizations/organization.entity';
import { User } from '../../base_modules/users/users.entity';
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
    @OneToMany(() => Analysis, (analysis) => analysis.analyzer)
    analyses: Relation<Analysis[]>;

    @ManyToOne(() => Organization, (organization) => organization.analyzers)
    organization: Relation<Organization>;

    @ManyToOne(() => User, (user) => user.analyzers_created)
    created_by: Relation<User>;
}
