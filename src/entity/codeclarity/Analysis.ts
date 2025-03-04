import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    Relation,
    ManyToOne,
    OneToMany
} from 'typeorm';
import { Policy } from './Policy';
import { Project } from './Project';
import { Result } from './Result';
import { Analyzer } from './Analyzer';
import { Organization } from './Organization';
import { Integration } from './Integration';
import { User } from '../../base_modules/users/users.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export enum AnalysisStatus {
    REQUESTED = 'requested',
    TRIGGERED = 'triggered',
    STARTED = 'started',
    FINISHED = 'finished',
    COMPLETED = 'completed',
    FAILED = 'failed',
    SUCCESS = 'success'
}

export interface StageBase {
    name: string;
    version: string;
    config: object;
}

export interface AnalysisStage extends StageBase {
    status: AnalysisStatus;
    result: object | undefined;
    started_on?: Date;
    ended_on?: Date;
}

@Entity()
export class Analysis {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    created_on: Date;

    @Column('jsonb')
    config: { [key: string]: { [key: string]: any } };

    @Column({
        nullable: true
    })
    stage: number;

    @ApiProperty()
    @Expose()
    @Column()
    status: AnalysisStatus;

    @ApiProperty()
    @Expose()
    @Column('jsonb')
    steps: AnalysisStage[][];

    @Column('timestamptz', { nullable: true })
    started_on?: Date;

    @Column('timestamptz', { nullable: true })
    ended_on?: Date;

    @ApiProperty()
    @Expose()
    @Column({
        length: 25
    })
    branch: string;

    @Column({
        length: 25,
        nullable: true
    })
    tag?: string;

    @Column({
        length: 25,
        nullable: true
    })
    commit_hash?: string;

    // Foreign keys
    @ManyToMany(() => Policy, (policy) => policy.analyses)
    policies: Relation<Policy[]>;

    @ManyToOne(() => Project, (project) => project.analyses)
    project: Relation<Project>;

    @ApiProperty()
    @Expose()
    @ManyToOne(() => Analyzer, (analyzer) => analyzer.analyses)
    analyzer: Relation<Analyzer>;

    @OneToMany(() => Result, (result) => result.analysis, { cascade: true })
    results: Relation<Result[]>;

    @ManyToOne(() => Organization, (organization) => organization.analyses)
    organization: Relation<Organization>;

    @ManyToOne(() => Integration, (integration) => integration.analyses)
    integration: Relation<Integration>;

    @ManyToOne(() => User, (user) => user.analyses)
    created_by: Relation<User>;
}
