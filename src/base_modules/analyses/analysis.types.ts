import { IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StageBase } from '../analyzers/analyzer.types';

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class AnalysisCreateBody {
    @ApiProperty({ description: 'The anaylzer id', example: '72305504' })
    @IsNotEmpty()
    analyzer_id: string;

    @ApiProperty({
        description: 'The anaylzer configuration',
        example: { license_policy_id: '72305504' }
    })
    @IsNotEmpty()
    config: { [key: string]: { [key: string]: any } };

    @ApiProperty({ description: 'Which branch of the repository to analyze', example: 'main' })
    @IsNotEmpty()
    branch: string;

    @ApiProperty({ description: 'Which tag of the repository to analyze', example: 'v1.0.0' })
    @IsOptional()
    @IsNotEmpty()
    tag?: string;

    @ApiProperty({
        description: 'Which commit of the repository to analyze',
        example: '063fc4320a8d1f901...'
    })
    @IsOptional()
    @IsNotEmpty()
    commit_hash?: string;
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
