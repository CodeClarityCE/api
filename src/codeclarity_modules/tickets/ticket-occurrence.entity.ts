import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Relation } from 'typeorm';
import type { Analysis } from '../../base_modules/analyses/analysis.entity';
import type { Ticket } from './ticket.entity';

@Entity()
export class TicketVulnerabilityOccurrence {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ApiProperty()
    @Expose()
    @Column({ length: 200 })
    workspace!: string;

    @ApiProperty({ description: 'Import paths where vulnerability appears' })
    @Expose()
    @Column('jsonb')
    affected_paths!: string[];

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    detected_on!: Date;

    @ApiProperty({ description: 'False when fixed in subsequent scan' })
    @Expose()
    @Column({ default: true })
    is_active!: boolean;

    @ApiProperty()
    @Expose()
    @Column('timestamptz', { nullable: true })
    resolved_on?: Date;

    // Foreign keys
    @ManyToOne('Ticket', 'occurrences', { onDelete: 'CASCADE' })
    ticket!: Relation<Ticket>;

    @ApiProperty()
    @Expose()
    @ManyToOne('Analysis')
    analysis!: Relation<Analysis>;
}

export interface TicketOccurrenceFrontend {
    id: string;
    workspace: string;
    affected_paths: string[];
    detected_on: Date;
    is_active: boolean;
    resolved_on?: Date;
    analysis_id: string;
}
