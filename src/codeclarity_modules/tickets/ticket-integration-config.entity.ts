import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Relation, Unique } from 'typeorm';
import type { Organization } from '../../base_modules/organizations/organization.entity';
import { ExternalTicketProvider } from './ticket-external-link.entity';

export enum ClickUpAuthMethod {
    API_KEY = 'API_KEY',
    OAUTH = 'OAUTH'
}

export interface ClickUpConfig {
    auth_method: ClickUpAuthMethod;
    api_key?: string;
    access_token?: string;
    refresh_token?: string;
    token_expiry?: Date;
    workspace_id?: string;
    space_id?: string;
    folder_id?: string;
    list_id?: string;
    auto_sync_on_create?: boolean;
    sync_status_changes?: boolean;
    priority_mapping?: Record<string, number>;
}

export interface JiraConfig {
    domain: string;
    email: string;
    api_token: string;
    project_key: string;
    issue_type_id: string;
    auto_sync_on_create?: boolean;
    sync_status_changes?: boolean;
    priority_mapping?: Record<string, string>;
}

export interface LinearConfig {
    api_key: string;
    team_id: string;
    project_id?: string;
    auto_sync_on_create?: boolean;
    sync_status_changes?: boolean;
    priority_mapping?: Record<string, number>;
}

export type IntegrationConfig = ClickUpConfig | JiraConfig | LinearConfig;

@Entity()
@Unique(['organization', 'provider'])
export class TicketIntegrationConfig {
    @ApiProperty()
    @Expose()
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ApiProperty({ enum: ExternalTicketProvider })
    @Expose()
    @Column({
        type: 'enum',
        enum: ExternalTicketProvider
    })
    provider!: ExternalTicketProvider;

    @ApiProperty()
    @Expose()
    @Column({ default: true })
    enabled!: boolean;

    @ApiProperty({ description: 'Provider-specific configuration' })
    @Column('jsonb')
    config!: IntegrationConfig;

    @ApiProperty()
    @Expose()
    @Column('timestamptz')
    created_on!: Date;

    @ApiProperty()
    @Expose()
    @Column('timestamptz', { nullable: true })
    updated_on?: Date;

    // Foreign keys
    @ManyToOne('Organization', { onDelete: 'CASCADE' })
    organization!: Relation<Organization>;
}

export interface TicketIntegrationConfigFrontend {
    id: string;
    provider: ExternalTicketProvider;
    enabled: boolean;
    created_on: Date;
    updated_on?: Date;
    // Note: config is excluded for security (contains API keys)
    has_config: boolean;
}
