import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Relation } from 'typeorm';
import type { User } from '../../base_modules/users/users.entity';
import type { Ticket } from './ticket.entity';

export enum TicketEventType {
    CREATED = 'CREATED',
    STATUS_CHANGED = 'STATUS_CHANGED',
    PRIORITY_CHANGED = 'PRIORITY_CHANGED',
    ASSIGNED = 'ASSIGNED',
    UNASSIGNED = 'UNASSIGNED',
    SYNCED_EXTERNAL = 'SYNCED_EXTERNAL',
    UNLINKED_EXTERNAL = 'UNLINKED_EXTERNAL',
    OCCURRENCE_ADDED = 'OCCURRENCE_ADDED',
    OCCURRENCE_RESOLVED = 'OCCURRENCE_RESOLVED',
    RESOLVED = 'RESOLVED',
    REOPENED = 'REOPENED',
    COMMENT_ADDED = 'COMMENT_ADDED',
    DUE_DATE_CHANGED = 'DUE_DATE_CHANGED'
}

export interface TicketEventData {
    old_status?: string | undefined;
    new_status?: string | undefined;
    old_priority?: string | undefined;
    new_priority?: string | undefined;
    assigned_to_id?: string | undefined;
    assigned_to_name?: string | undefined;
    external_provider?: string | undefined;
    external_id?: string | undefined;
    external_url?: string | undefined;
    analysis_id?: string | undefined;
    vulnerability_id?: string | undefined;
    comment?: string | undefined;
    old_due_date?: string | undefined;
    new_due_date?: string | undefined;
    source?: 'manual' | 'automation' | 'sync' | undefined;
}

@Entity()
export class TicketEvent {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ApiProperty({ enum: TicketEventType })
    @Expose()
    @Column({
        type: 'enum',
        enum: TicketEventType
    })
    event_type!: TicketEventType;

    @ApiProperty()
    @Expose()
    @Column('jsonb')
    event_data!: TicketEventData;

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    created_on!: Date;

    // Foreign keys
    @ManyToOne('Ticket', 'events', { onDelete: 'CASCADE' })
    ticket!: Relation<Ticket>;

    @ApiProperty()
    @Expose()
    @ManyToOne('User', { nullable: true })
    performed_by?: Relation<User>;
}

export interface TicketEventFrontend {
    id: string;
    event_type: TicketEventType;
    event_data: TicketEventData;
    created_on: Date;
    performed_by_id: string | undefined;
    performed_by_name: string | undefined;
}
