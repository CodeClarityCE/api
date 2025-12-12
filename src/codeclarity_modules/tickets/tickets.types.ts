import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    IsNumber,
    IsDateString,
    IsArray
} from 'class-validator';
import { ExternalTicketProvider } from './ticket-external-link.entity';
import { TicketPriority, TicketStatus, TicketType } from './ticket.entity';

// ============================================
// Request DTOs
// ============================================

export class CreateTicketBody {
    @ApiProperty({ description: 'Ticket title', maxLength: 200 })
    @IsString()
    @MaxLength(200)
    title!: string;

    @ApiProperty({ description: 'Ticket description' })
    @IsString()
    description!: string;

    @ApiProperty({ enum: TicketPriority })
    @IsEnum(TicketPriority)
    priority!: TicketPriority;

    @ApiProperty({ enum: TicketType })
    @IsEnum(TicketType)
    type!: TicketType;

    @ApiProperty({ description: 'Project ID' })
    @IsUUID()
    project_id!: string;

    @ApiPropertyOptional({ description: 'Vulnerability ID (e.g., CVE-2021-44228)' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    vulnerability_id?: string;

    @ApiPropertyOptional({ description: 'Affected package name' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    affected_package?: string;

    @ApiPropertyOptional({ description: 'Affected version' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    affected_version?: string;

    @ApiPropertyOptional({ description: 'Severity score (0-10)' })
    @IsOptional()
    @IsNumber()
    severity_score?: number;

    @ApiPropertyOptional({ description: 'Severity class (CRITICAL, HIGH, MEDIUM, LOW, NONE)' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    severity_class?: string;

    @ApiPropertyOptional({ description: 'Recommended version to upgrade to' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    recommended_version?: string;

    @ApiPropertyOptional({ description: 'Remediation notes' })
    @IsOptional()
    @IsString()
    remediation_notes?: string;

    @ApiPropertyOptional({ description: 'Due date for the ticket' })
    @IsOptional()
    @IsDateString()
    due_date?: string;

    @ApiPropertyOptional({ description: 'Source analysis ID' })
    @IsOptional()
    @IsUUID()
    source_analysis_id?: string;

    @ApiPropertyOptional({ description: 'Also sync to external provider' })
    @IsOptional()
    @IsEnum(ExternalTicketProvider)
    sync_to_provider?: ExternalTicketProvider;
}

export class UpdateTicketBody {
    @ApiPropertyOptional({ description: 'Ticket title', maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    @ApiPropertyOptional({ description: 'Ticket description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: TicketStatus })
    @IsOptional()
    @IsEnum(TicketStatus)
    status?: TicketStatus;

    @ApiPropertyOptional({ enum: TicketPriority })
    @IsOptional()
    @IsEnum(TicketPriority)
    priority?: TicketPriority;

    @ApiPropertyOptional({ description: 'Assigned user ID' })
    @IsOptional()
    @IsUUID()
    assigned_to_id?: string;

    @ApiPropertyOptional({ description: 'Remediation notes' })
    @IsOptional()
    @IsString()
    remediation_notes?: string;

    @ApiPropertyOptional({ description: 'Due date for the ticket' })
    @IsOptional()
    @IsDateString()
    due_date?: string;
}

export class BulkUpdateTicketsBody {
    @ApiProperty({ description: 'Ticket IDs to update' })
    @IsArray()
    @IsUUID('4', { each: true })
    ticket_ids!: string[];

    @ApiPropertyOptional({ enum: TicketStatus })
    @IsOptional()
    @IsEnum(TicketStatus)
    status?: TicketStatus;

    @ApiPropertyOptional({ enum: TicketPriority })
    @IsOptional()
    @IsEnum(TicketPriority)
    priority?: TicketPriority;

    @ApiPropertyOptional({ description: 'Assigned user ID' })
    @IsOptional()
    @IsUUID()
    assigned_to_id?: string;
}

export class CheckDuplicateBody {
    @ApiProperty({ description: 'Project ID' })
    @IsUUID()
    project_id!: string;

    @ApiProperty({ description: 'Vulnerability ID' })
    @IsString()
    vulnerability_id!: string;
}

// ============================================
// Response Types
// ============================================

export interface TicketSummary {
    id: string;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    type: TicketType;
    vulnerability_id: string | undefined;
    affected_package: string | undefined;
    severity_score: number | undefined;
    severity_class: string | undefined;
    created_on: Date;
    updated_on: Date | undefined;
    project_id: string;
    project_name: string;
    assigned_to_id: string | undefined;
    assigned_to_name: string | undefined;
    has_external_links: boolean;
    external_status: string | undefined;
}

export interface TicketDetails extends TicketSummary {
    description: string;
    affected_version: string | undefined;
    recommended_version: string | undefined;
    remediation_notes: string | undefined;
    resolved_on: Date | undefined;
    due_date: Date | undefined;
    created_by_id: string;
    created_by_name: string;
    source_analysis_id: string | undefined;
    external_links: {
        id: string;
        provider: ExternalTicketProvider;
        external_id: string;
        external_url: string;
        synced_on: Date;
    }[];
    occurrence_count: number;
    active_occurrence_count: number;
}

export interface TicketDashboardStats {
    total_open: number;
    total_in_progress: number;
    total_resolved_this_week: number;
    total_closed: number;
    by_priority: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    by_project: {
        project_id: string;
        project_name: string;
        open_count: number;
    }[];
    recent_tickets: TicketSummary[];
    avg_resolution_time_days: number | null;
}

export interface BulkUpdateResult {
    updated_count: number;
    ticket_ids: string[];
}

export interface DuplicateCheckResult {
    exists: boolean;
    existing_ticket_id?: string;
    existing_ticket_title?: string;
    existing_ticket_status?: TicketStatus;
}

// ============================================
// Filter Types
// ============================================

export interface TicketFilters {
    status?: TicketStatus[] | undefined;
    priority?: TicketPriority[] | undefined;
    type?: TicketType[] | undefined;
    project_id?: string | undefined;
    assigned_to_id?: string | undefined;
    has_external_link?: boolean | undefined;
    vulnerability_id?: string | undefined;
    severity_class?: string[] | undefined;
    created_after?: Date | undefined;
    created_before?: Date | undefined;
}

export type TicketSortField =
    | 'created_on'
    | 'updated_on'
    | 'priority'
    | 'status'
    | 'severity_score'
    | 'title'
    | 'due_date';

// ============================================
// Integration Types
// ============================================

export class ConfigureClickUpBody {
    @ApiProperty({ description: 'Authentication method: API_KEY or OAUTH' })
    @IsString()
    auth_method!: 'API_KEY' | 'OAUTH';

    @ApiPropertyOptional({ description: 'ClickUp API key (for API_KEY auth)' })
    @IsOptional()
    @IsString()
    api_key?: string;

    @ApiPropertyOptional({ description: 'OAuth access token (for OAUTH auth)' })
    @IsOptional()
    @IsString()
    access_token?: string;

    @ApiPropertyOptional({ description: 'OAuth refresh token (for OAUTH auth)' })
    @IsOptional()
    @IsString()
    refresh_token?: string;

    @ApiPropertyOptional({ description: 'ClickUp Workspace/Team ID' })
    @IsOptional()
    @IsString()
    workspace_id?: string;

    @ApiPropertyOptional({ description: 'ClickUp Space ID' })
    @IsOptional()
    @IsString()
    space_id?: string;

    @ApiPropertyOptional({ description: 'ClickUp Folder ID' })
    @IsOptional()
    @IsString()
    folder_id?: string;

    @ApiProperty({ description: 'ClickUp List ID where tasks will be created' })
    @IsString()
    list_id!: string;

    @ApiPropertyOptional({ description: 'Auto-sync new tickets to ClickUp' })
    @IsOptional()
    auto_sync_on_create?: boolean;

    @ApiPropertyOptional({ description: 'Sync status changes to ClickUp' })
    @IsOptional()
    sync_status_changes?: boolean;
}

export interface IntegrationConfigSummary {
    id: string;
    provider: string;
    enabled: boolean;
    created_on: Date;
    updated_on?: Date | undefined;
    has_config: boolean;
    workspace_name?: string | undefined;
    list_name?: string | undefined;
}

export interface IntegrationHierarchyItem {
    id: string;
    name: string;
}

export interface SyncResult {
    ticket_id: string;
    external_id: string;
    external_url: string;
    provider: string;
}

export interface BulkSyncResult {
    synced: SyncResult[];
    failed: { ticket_id: string; error: string }[];
}

/** Result from syncing a single ticket FROM external provider */
export interface SyncFromExternalResult {
    ticket_id: string;
    updated: boolean;
    old_status?: TicketStatus;
    new_status?: TicketStatus;
    external_status?: string;
}

/** Result from bulk syncing tickets FROM external provider */
export interface BulkSyncFromExternalResult {
    updated: SyncFromExternalResult[];
    unchanged: string[];
    failed: { ticket_id: string; error: string }[];
}
