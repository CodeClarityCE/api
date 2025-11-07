import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    Relation,
    ManyToOne,
    OneToMany
} from 'typeorm';
import { Policy } from '../../codeclarity_modules/policies/policy.entity';
import { Result } from '../../codeclarity_modules/results/result.entity';
import { Analyzer } from '../analyzers/analyzer.entity';
import { Integration } from '../integrations/integrations.entity';
import { Organization } from '../organizations/organization.entity';
import { Project } from '../projects/project.entity';
import { User } from '../users/users.entity';

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
    id!: string;

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    created_on!: Date;

    @Column('jsonb')
    config!: Record<string, Record<string, any>>;

    @Column({
        nullable: true
    })
    stage!: number;

    @ApiProperty()
    @Expose()
    @Column()
    status!: AnalysisStatus;

    @ApiProperty()
    @Expose()
    @Column('jsonb')
    steps!: AnalysisStage[][];

    @Column('timestamptz', { nullable: true })
    started_on?: Date;

    @Column('timestamptz', { nullable: true })
    ended_on?: Date;

    @ApiProperty()
    @Expose()
    @Column({
        length: 25
    })
    branch!: string;

    @Column({
        type: 'varchar',
        length: 25,
        nullable: true
    })
    tag?: string;

    @Column({
        type: 'varchar',
        length: 25,
        nullable: true
    })
    commit_hash?: string;

    // Foreign keys
    @ManyToMany(() => Policy, (policy) => policy.analyses)
    policies!: Relation<Policy[]>;

    @ManyToOne(() => Project, (project) => project.analyses)
    project!: Relation<Project>;

    @ApiProperty()
    @Expose()
    @ManyToOne(() => Analyzer, (analyzer) => analyzer.analyses)
    analyzer!: Relation<Analyzer>;

    @OneToMany(() => Result, (result) => result.analysis, { cascade: true })
    results!: Relation<Result[]>;

    @ManyToOne(() => Organization, (organization) => organization.analyses)
    organization!: Relation<Organization>;

    @ManyToOne(() => Integration, (integration) => integration.analyses)
    integration!: Relation<Integration>;

    @ManyToOne(() => User, (user) => user.analyses)
    created_by!: Relation<User>;

    // ===== ANALYSIS SCHEDULING FIELDS =====
    // Added to support recurring analysis execution
    // Simplified from original complex scheduling system to improve maintainability

    /**
     * Defines how often this analysis should run
     * - 'once': Run immediately when created (default behavior)
     * - 'daily': Run every day at the specified time
     * - 'weekly': Run every week at the specified time
     */
    @ApiProperty({
        description: 'Schedule frequency for recurring analysis',
        enum: ['once', 'daily', 'weekly'],
        default: 'once',
        example: 'daily'
    })
    @Expose()
    @Column({
        type: 'enum',
        enum: ['once', 'daily', 'weekly'],
        default: 'once',
        nullable: true
    })
    schedule_type?: 'once' | 'daily' | 'weekly';

    /**
     * When this analysis should next be executed
     * - For 'once': ignored (runs immediately)
     * - For 'daily'/'weekly': the specific date/time for first/next execution
     */
    @ApiProperty({
        description: 'Next scheduled execution time',
        type: Date,
        example: '2024-01-15T10:00:00Z'
    })
    @Expose()
    @Column('timestamptz', { nullable: true })
    next_scheduled_run?: Date | undefined;

    /**
     * Whether this scheduled analysis is currently active
     * - true: Analysis will run according to schedule_type
     * - false: Analysis is paused/disabled
     */
    @ApiProperty({
        description: 'Whether the scheduled analysis is active',
        default: true,
        example: true
    })
    @Expose()
    @Column({ default: true })
    is_active!: boolean;

    /**
     * When this analysis was last executed by the scheduler
     * Used to calculate the next execution time for recurring schedules
     * - null: Analysis has never been executed
     * - Date: Last execution timestamp
     */
    @ApiProperty({
        description: 'Last scheduled execution time',
        type: Date,
        example: '2024-01-15T10:00:00Z'
    })
    @Expose()
    @Column('timestamptz', { nullable: true })
    last_scheduled_run?: Date | undefined;
}
