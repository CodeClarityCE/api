import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Relation } from 'typeorm';
import { Analysis } from '../../base_modules/analyses/analysis.entity';

@Entity()
export class Result {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('jsonb')
    result: ResultObject;

    // Foreign keys
    @ManyToOne(() => Analysis, (analysis) => analysis.results)
    analysis: Relation<Analysis>;

    @Column()
    plugin: string;
}

export interface ResultByAnalysisId {
    id: string;
    image: string;
}

export interface ResultObject {
    result: object;
    analysis_info: any;
}

export interface AnalysisInfo {
    extra: any;
    errors: Array<any>;
    status: string;
    time: any;
}
