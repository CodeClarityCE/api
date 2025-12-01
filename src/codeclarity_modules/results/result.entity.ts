import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Relation } from 'typeorm';
import type { Analysis } from '../../base_modules/analyses/analysis.entity';

@Entity()
export class Result {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ApiProperty()
    @Expose()
    @Column('jsonb')
    result!: ResultObject;

    // Foreign keys
    @ManyToOne('Analysis', 'results')
    analysis!: Relation<Analysis>;

    @ApiProperty()
    @Expose()
    @Column()
    plugin!: string;

    @ApiProperty()
    @Expose()
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_on!: Date;
}

export interface ResultByAnalysisId {
    id: string;
    image: string;
}

export interface ResultObject {
    workspaces: object;
    analysis_info: unknown;
}

export interface AnalysisInfo {
    extra: unknown;
    errors: unknown[];
    status: string;
    time: unknown;
}
