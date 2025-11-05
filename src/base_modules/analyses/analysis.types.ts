import { IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StageBase } from '../analyzers/analyzer.types';

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class AnalysisCreateBody {
    @ApiProperty({ description: 'The anaylzer id', example: '72305504' })
    @IsNotEmpty()
    analyzer_id!: string;

    @ApiProperty({
        description: 'The anaylzer configuration',
        example: { license_policy_id: '72305504' }
    })
    @IsNotEmpty()
    config!: { [key: string]: { [key: string]: any } };

    @ApiProperty({ description: 'Which branch of the repository to analyze', example: 'main' })
    @IsNotEmpty()
    branch!: string;

    @ApiProperty({ description: 'Which tag of the repository to analyze', example: 'v1.0.0' })
    @IsOptional()
    @IsNotEmpty()
    tag?: string;

    @ApiProperty({
        description: 'Programming language(s) to analyze. If not specified, will be auto-detected.',
        example: ['javascript', 'php'],
        type: [String],
        required: false
    })
    @IsOptional()
    languages?: string[];

    @ApiProperty({
        description: 'Which commit of the repository to analyze',
        example: '063fc4320a8d1f901...'
    })
    @IsOptional()
    @IsNotEmpty()
    commit_hash?: string;

    // ===== SCHEDULING CONFIGURATION =====
    // Optional fields for configuring recurring analysis execution

    @ApiProperty({
        description: 'How frequently this analysis should execute',
        enum: ['once', 'daily', 'weekly'],
        required: false,
        default: 'once',
        example: 'daily',
        examples: {
            immediate: { value: 'once', description: 'Run immediately when created' },
            daily: { value: 'daily', description: 'Run every day at specified time' },
            weekly: { value: 'weekly', description: 'Run every week at specified time' }
        }
    })
    @IsOptional()
    @IsEnum(['once', 'daily', 'weekly'], {
        message: 'schedule_type must be one of: once, daily, weekly'
    })
    schedule_type?: 'once' | 'daily' | 'weekly';

    @ApiProperty({
        description:
            'When to next execute this analysis (ISO 8601 format). Required for daily/weekly schedules.',
        example: '2024-01-15T10:00:00Z',
        required: false,
        format: 'date-time'
    })
    @IsOptional()
    @IsDateString(
        {},
        {
            message: 'next_scheduled_run must be a valid ISO 8601 date string'
        }
    )
    next_scheduled_run?: string;

    @ApiProperty({
        description:
            'Whether scheduled execution is enabled. Set to false to pause scheduled runs.',
        default: true,
        required: false,
        example: true
    })
    @IsOptional()
    @IsBoolean({
        message: 'is_active must be a boolean value'
    })
    is_active?: boolean;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface AnalysisCreate {
    created_on: Date;
    analyzer_id: string;
    created_by: string;
    config: { [key: string]: { [key: string]: any } };
    stage: number;
    status: AnalysisStatus;
    steps: AnalysisStage[][];
    started_on?: Date;
    ended_on?: Date;
    branch: string;
    tag?: string;
    commit_hash?: string;
    project_id: string;
    organization_id: string;
    integration_id: string;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface AnalysisUpdate extends AnalysisCreate {}

/********************************************/
/*                Other types               */
/********************************************/

export interface AnalysisStage extends StageBase {
    status: AnalysisStatus;
    result: object | undefined;
    started_on?: Date;
    ended_on?: Date;
}

export enum AnalysisStatus {
    REQUESTED = 'requested',
    TRIGGERED = 'triggered',
    STARTED = 'started',
    FINISHED = 'finished',
    COMPLETED = 'completed',
    FAILED = 'failed',
    SUCCESS = 'success'
}

/********************************************/
/*        Schedule Management Types         */
/********************************************/

/**
 * Request body for updating analysis scheduling configuration
 *
 * Used by PUT /analyses/:id/schedule endpoint to modify when and how
 * frequently an analysis should execute.
 *
 * @example
 * {
 *   "schedule_type": "daily",
 *   "next_scheduled_run": "2024-01-15T10:00:00Z",
 *   "is_active": true
 * }
 */
export class ScheduleUpdateBody {
    @ApiProperty({
        description: 'New schedule frequency for the analysis',
        enum: ['once', 'daily', 'weekly'],
        example: 'daily',
        examples: {
            immediate: { value: 'once', description: 'Convert to one-time execution' },
            daily: { value: 'daily', description: 'Execute every day' },
            weekly: { value: 'weekly', description: 'Execute every week' }
        }
    })
    @IsEnum(['once', 'daily', 'weekly'], {
        message: 'schedule_type must be one of: once, daily, weekly'
    })
    schedule_type!: 'once' | 'daily' | 'weekly';

    @ApiProperty({
        description: 'When the analysis should next be executed (ISO 8601 format)',
        example: '2024-01-15T10:00:00Z',
        format: 'date-time'
    })
    @IsDateString(
        {},
        {
            message: 'next_scheduled_run must be a valid ISO 8601 date string'
        }
    )
    next_scheduled_run!: string;

    @ApiProperty({
        description: 'Whether the analysis schedule is active (enabled/disabled)',
        default: true,
        example: true
    })
    @IsBoolean({
        message: 'is_active must be a boolean value'
    })
    is_active!: boolean;
}
