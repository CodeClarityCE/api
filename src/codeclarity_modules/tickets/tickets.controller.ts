import {
    Body,
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    Param,
    ParseBoolPipe,
    ParseIntPipe,
    Patch,
    Post,
    Query
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { VulnerabilityDetailsReport } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses.types';
import { SortDirection } from 'src/types/sort.types';
import { TicketAutomationService } from './automation/ticket-automation.service';
import { ConnectionTestResult } from './integrations/integration-provider.interface';
import { TicketIntegrationService } from './integrations/ticket-integration.service';
import { TicketEventFrontend } from './ticket-event.entity';
import { ExternalTicketProvider, TicketExternalLinkFrontend } from './ticket-external-link.entity';
import { ClickUpAuthMethod, ClickUpConfig } from './ticket-integration-config.entity';
import { TicketStatus, TicketPriority, TicketType } from './ticket.entity';
import { TicketsService } from './tickets.service';
import {
    CreateTicketBody,
    UpdateTicketBody,
    BulkUpdateTicketsBody,
    CheckDuplicateBody,
    TicketSummary,
    TicketDetails,
    TicketDashboardStats,
    BulkUpdateResult,
    DuplicateCheckResult,
    TicketSortField,
    ConfigureClickUpBody,
    IntegrationConfigSummary,
    IntegrationHierarchyItem,
    SyncResult,
    BulkSyncResult,
    SyncFromExternalResult,
    BulkSyncFromExternalResult
} from './tickets.types';

/** Response type for auto-resolve operation */
interface AutoResolveResponse {
    resolved_count: number;
    ticket_ids: string[];
}

// Helper to normalize query arrays
function normalizeQueryArray<T>(value: T | T[] | undefined): T[] | undefined {
    if (!value) return undefined;
    return Array.isArray(value) ? value : [value];
}

// Helper to get performer name
function getPerformerName(
    performer: { first_name: string; last_name: string } | undefined
): string | undefined {
    if (!performer) return undefined;
    return `${performer.first_name} ${performer.last_name}`;
}

@ApiTags('Tickets')
@Controller('org/:org_id/tickets')
export class TicketsController {
    constructor(
        private readonly ticketsService: TicketsService,
        private readonly ticketAutomationService: TicketAutomationService,
        private readonly ticketIntegrationService: TicketIntegrationService
    ) {}

    @Post('')
    @ApiOperation({ summary: 'Create a new ticket' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 201, description: 'Ticket created successfully' })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    @ApiResponse({ status: 404, description: 'Organization or project not found' })
    async create(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Body() createBody: CreateTicketBody
    ): Promise<CreatedResponse> {
        const id = await this.ticketsService.create(org_id, createBody, user);
        return { id };
    }

    // eslint-disable-next-line max-params
    @Get('')
    @ApiOperation({ summary: 'Get all tickets for an organization' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (0-based)' })
    @ApiQuery({
        name: 'entries_per_page',
        required: false,
        description: 'Number of entries per page'
    })
    @ApiQuery({ name: 'search_key', required: false, description: 'Search term for filtering' })
    @ApiQuery({ name: 'sort_by', required: false, description: 'Field to sort by' })
    @ApiQuery({
        name: 'sort_direction',
        required: false,
        enum: SortDirection,
        description: 'Sort direction'
    })
    @ApiQuery({
        name: 'status',
        required: false,
        isArray: true,
        enum: TicketStatus,
        description: 'Filter by status'
    })
    @ApiQuery({
        name: 'priority',
        required: false,
        isArray: true,
        enum: TicketPriority,
        description: 'Filter by priority'
    })
    @ApiQuery({
        name: 'type',
        required: false,
        isArray: true,
        enum: TicketType,
        description: 'Filter by type'
    })
    @ApiQuery({ name: 'project_id', required: false, description: 'Filter by project' })
    @ApiQuery({ name: 'assigned_to_id', required: false, description: 'Filter by assignee' })
    @ApiQuery({
        name: 'vulnerability_id',
        required: false,
        description: 'Filter by vulnerability ID'
    })
    @ApiResponse({ status: 200, description: 'Tickets retrieved successfully' })
    async getMany(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(20), ParseIntPipe)
        entries_per_page?: number,
        @Query('search_key') search_key?: string,
        @Query('sort_by') sort_by?: TicketSortField,
        @Query('sort_direction') sort_direction?: SortDirection,
        @Query('status') status?: TicketStatus | TicketStatus[],
        @Query('priority') priority?: TicketPriority | TicketPriority[],
        @Query('type') type?: TicketType | TicketType[],
        @Query('project_id') project_id?: string,
        @Query('assigned_to_id') assigned_to_id?: string,
        @Query('vulnerability_id') vulnerability_id?: string
    ): Promise<TypedPaginatedResponse<TicketSummary>> {
        const filters = {
            status: normalizeQueryArray(status),
            priority: normalizeQueryArray(priority),
            type: normalizeQueryArray(type),
            project_id,
            assigned_to_id,
            vulnerability_id
        };

        return await this.ticketsService.getMany(
            org_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user,
            filters,
            search_key,
            sort_by,
            sort_direction
        );
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get ticket statistics for dashboard' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
    async getDashboardStats(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('integration_ids') integration_ids?: string
    ): Promise<TypedResponse<TicketDashboardStats>> {
        const integrationIdArray = integration_ids?.split(',').filter(Boolean);
        const stats = await this.ticketsService.getDashboardStats(org_id, user, integrationIdArray);
        return { data: stats };
    }

    @Post('check-duplicate')
    @ApiOperation({ summary: 'Check if a ticket already exists for a vulnerability' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 200, description: 'Duplicate check completed' })
    async checkDuplicate(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Body() body: CheckDuplicateBody
    ): Promise<TypedResponse<DuplicateCheckResult>> {
        const result = await this.ticketsService.checkDuplicate(
            org_id,
            body.project_id,
            body.vulnerability_id,
            user
        );
        return { data: result };
    }

    @Post('automation/process-analysis/:analysis_id')
    @ApiOperation({
        summary: 'Process auto-resolve for a completed analysis',
        description:
            'Triggers the auto-resolve workflow for a completed analysis. ' +
            'If the organization has auto_resolve_tickets enabled, tickets for ' +
            'vulnerabilities that are no longer detected will be automatically resolved.'
    })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'analysis_id', description: 'Analysis ID to process' })
    @ApiResponse({
        status: 200,
        description: 'Auto-resolve processing completed',
        schema: {
            type: 'object',
            properties: {
                data: {
                    type: 'object',
                    properties: {
                        resolved_count: { type: 'number' },
                        ticket_ids: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        }
    })
    async processAnalysisAutoResolve(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Param('analysis_id') analysis_id: string
    ): Promise<TypedResponse<AutoResolveResponse>> {
        const result = await this.ticketAutomationService.processCompletedAnalysis(analysis_id);
        return { data: result };
    }

    @Patch('bulk')
    @ApiOperation({ summary: 'Bulk update multiple tickets' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 200, description: 'Tickets updated successfully' })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    async bulkUpdate(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Body() body: BulkUpdateTicketsBody
    ): Promise<TypedResponse<BulkUpdateResult>> {
        const result = await this.ticketsService.bulkUpdate(org_id, body, user);
        return { data: result };
    }

    @Get(':ticket_id')
    @ApiOperation({ summary: 'Get a ticket by ID' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiResponse({ status: 200, description: 'Ticket retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Ticket not found' })
    async get(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('ticket_id') ticket_id: string
    ): Promise<TypedResponse<TicketDetails>> {
        const ticket = await this.ticketsService.get(org_id, ticket_id, user);
        return { data: ticket };
    }

    @Patch(':ticket_id')
    @ApiOperation({ summary: 'Update a ticket' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiResponse({ status: 200, description: 'Ticket updated successfully' })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    @ApiResponse({ status: 404, description: 'Ticket not found' })
    async update(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('ticket_id') ticket_id: string,
        @Body() updateBody: UpdateTicketBody
    ): Promise<NoDataResponse> {
        await this.ticketsService.update(org_id, ticket_id, updateBody, user);
        return {};
    }

    @Delete(':ticket_id')
    @ApiOperation({ summary: 'Delete a ticket' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiResponse({ status: 200, description: 'Ticket deleted successfully' })
    @ApiResponse({ status: 403, description: 'Insufficient permissions (admin required)' })
    @ApiResponse({ status: 404, description: 'Ticket not found' })
    async delete(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('ticket_id') ticket_id: string
    ): Promise<NoDataResponse> {
        await this.ticketsService.delete(org_id, ticket_id, user);
        return {};
    }

    @Get(':ticket_id/events')
    @ApiOperation({ summary: 'Get ticket activity/events' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Ticket not found' })
    async getEvents(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('ticket_id') ticket_id: string
    ): Promise<TypedResponse<TicketEventFrontend[]>> {
        const events = await this.ticketsService.getEvents(org_id, ticket_id, user);
        const eventsFrontend: TicketEventFrontend[] = events.map((e) => ({
            id: e.id,
            event_type: e.event_type,
            event_data: e.event_data,
            created_on: e.created_on,
            performed_by_id: e.performed_by?.id,
            performed_by_name: getPerformerName(e.performed_by)
        }));
        return { data: eventsFrontend };
    }

    @Get(':ticket_id/vulnerability')
    @ApiOperation({ summary: 'Get vulnerability details for a ticket' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiResponse({
        status: 200,
        description: 'Vulnerability details retrieved successfully (null if not a vulnerability ticket)'
    })
    @ApiResponse({ status: 404, description: 'Ticket not found' })
    async getVulnerabilityDetails(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('ticket_id') ticket_id: string
    ): Promise<TypedResponse<VulnerabilityDetailsReport | null>> {
        const vulnDetails = await this.ticketsService.getVulnerabilityDetails(
            org_id,
            ticket_id,
            user
        );
        return { data: vulnDetails };
    }

    // ============================================
    // Integration Endpoints
    // ============================================

    @Get('integrations')
    @ApiOperation({ summary: 'Get all configured integrations for the organization' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 200, description: 'Integrations retrieved successfully' })
    async getIntegrations(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string
    ): Promise<TypedResponse<IntegrationConfigSummary[]>> {
        const configs = await this.ticketIntegrationService.getIntegrationConfigs(org_id);
        const summaries: IntegrationConfigSummary[] = configs.map((c) => ({
            id: c.id,
            provider: c.provider,
            enabled: c.enabled,
            created_on: c.created_on,
            updated_on: c.updated_on,
            has_config: !!c.config
        }));
        return { data: summaries };
    }

    @Post('integrations/clickup')
    @ApiOperation({ summary: 'Configure ClickUp integration' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 200, description: 'Integration configured successfully' })
    async configureClickUp(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Body() body: ConfigureClickUpBody
    ): Promise<NoDataResponse> {
        const config: ClickUpConfig = {
            auth_method:
                body.auth_method === 'OAUTH' ? ClickUpAuthMethod.OAUTH : ClickUpAuthMethod.API_KEY,
            api_key: body.api_key,
            access_token: body.access_token,
            refresh_token: body.refresh_token,
            workspace_id: body.workspace_id,
            space_id: body.space_id,
            folder_id: body.folder_id,
            list_id: body.list_id,
            auto_sync_on_create: body.auto_sync_on_create,
            sync_status_changes: body.sync_status_changes
        };

        await this.ticketIntegrationService.saveIntegrationConfig(
            org_id,
            ExternalTicketProvider.CLICKUP,
            config
        );
        return {};
    }

    @Delete('integrations/:provider')
    @ApiOperation({ summary: 'Remove an integration' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiResponse({ status: 200, description: 'Integration removed successfully' })
    async removeIntegration(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider
    ): Promise<NoDataResponse> {
        await this.ticketIntegrationService.deleteIntegrationConfig(org_id, provider);
        return {};
    }

    // ============================================
    // OAuth Endpoints
    // ============================================

    @Get('integrations/clickup/oauth/url')
    @ApiOperation({ summary: 'Get ClickUp OAuth authorization URL' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiQuery({ name: 'redirect_uri', description: 'OAuth redirect URI' })
    @ApiResponse({ status: 200, description: 'OAuth URL generated successfully' })
    getClickUpOAuthUrl(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Query('redirect_uri') redirect_uri: string
    ): TypedResponse<{ url: string }> {
        const url = this.ticketIntegrationService.getOAuthUrl(
            ExternalTicketProvider.CLICKUP,
            redirect_uri,
            org_id
        );
        return { data: { url } };
    }

    @Post('integrations/clickup/oauth/callback')
    @ApiOperation({ summary: 'Handle ClickUp OAuth callback' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 200, description: 'OAuth tokens exchanged successfully' })
    async handleClickUpOAuthCallback(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Body() body: { code: string; redirect_uri: string }
    ): Promise<TypedResponse<{ access_token: string }>> {
        const tokens = await this.ticketIntegrationService.exchangeOAuthCode(
            ExternalTicketProvider.CLICKUP,
            body.code,
            body.redirect_uri
        );
        return { data: { access_token: tokens.access_token } };
    }

    @Post('integrations/:provider/test')
    @ApiOperation({ summary: 'Test integration connection' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiResponse({ status: 200, description: 'Connection test completed' })
    async testIntegration(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider
    ): Promise<TypedResponse<ConnectionTestResult>> {
        const result = await this.ticketIntegrationService.testConnection(org_id, provider);
        return { data: result };
    }

    @Patch('integrations/:provider/toggle')
    @ApiOperation({ summary: 'Enable or disable an integration' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiQuery({ name: 'enabled', description: 'Enable or disable', type: Boolean })
    @ApiResponse({ status: 200, description: 'Integration toggled successfully' })
    async toggleIntegration(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Query('enabled', ParseBoolPipe) enabled: boolean
    ): Promise<NoDataResponse> {
        await this.ticketIntegrationService.toggleIntegration(org_id, provider, enabled);
        return {};
    }

    // ============================================
    // Integration Hierarchy Endpoints (for UI selectors)
    // ============================================

    @Get('integrations/:provider/workspaces')
    @ApiOperation({ summary: 'Get available workspaces/teams' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiResponse({ status: 200, description: 'Workspaces retrieved successfully' })
    async getWorkspaces(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider
    ): Promise<TypedResponse<IntegrationHierarchyItem[]>> {
        const workspaces = await this.ticketIntegrationService.getWorkspaces(org_id, provider);
        return { data: workspaces };
    }

    @Get('integrations/:provider/spaces/:workspace_id')
    @ApiOperation({ summary: 'Get spaces within a workspace' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiParam({ name: 'workspace_id', description: 'Workspace ID' })
    @ApiResponse({ status: 200, description: 'Spaces retrieved successfully' })
    async getSpaces(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Param('workspace_id') workspace_id: string
    ): Promise<TypedResponse<IntegrationHierarchyItem[]>> {
        const spaces = await this.ticketIntegrationService.getSpaces(
            org_id,
            provider,
            workspace_id
        );
        return { data: spaces };
    }

    @Get('integrations/:provider/folders/:space_id')
    @ApiOperation({ summary: 'Get folders within a space' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiParam({ name: 'space_id', description: 'Space ID' })
    @ApiResponse({ status: 200, description: 'Folders retrieved successfully' })
    async getFolders(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Param('space_id') space_id: string
    ): Promise<TypedResponse<IntegrationHierarchyItem[]>> {
        const folders = await this.ticketIntegrationService.getFolders(org_id, provider, space_id);
        return { data: folders };
    }

    @Get('integrations/:provider/lists/:parent_id')
    @ApiOperation({ summary: 'Get lists within a folder or space' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiParam({ name: 'parent_id', description: 'Parent (Folder or Space) ID' })
    @ApiResponse({ status: 200, description: 'Lists retrieved successfully' })
    async getLists(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Param('parent_id') parent_id: string
    ): Promise<TypedResponse<IntegrationHierarchyItem[]>> {
        const lists = await this.ticketIntegrationService.getLists(org_id, provider, parent_id);
        return { data: lists };
    }

    // ============================================
    // Integration Hierarchy Creation Endpoints
    // ============================================

    @Post('integrations/:provider/workspaces/:workspace_id/spaces')
    @ApiOperation({ summary: 'Create a space in a workspace' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiParam({ name: 'workspace_id', description: 'Workspace ID' })
    @ApiResponse({ status: 201, description: 'Space created successfully' })
    async createSpace(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Param('workspace_id') workspace_id: string,
        @Body() body: { name: string }
    ): Promise<TypedResponse<IntegrationHierarchyItem>> {
        const space = await this.ticketIntegrationService.createSpace(
            org_id,
            provider,
            workspace_id,
            body.name
        );
        return { data: space };
    }

    @Post('integrations/:provider/spaces/:space_id/folders')
    @ApiOperation({ summary: 'Create a folder in a space' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiParam({ name: 'space_id', description: 'Space ID' })
    @ApiResponse({ status: 201, description: 'Folder created successfully' })
    async createFolder(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Param('space_id') space_id: string,
        @Body() body: { name: string }
    ): Promise<TypedResponse<IntegrationHierarchyItem>> {
        const folder = await this.ticketIntegrationService.createFolder(
            org_id,
            provider,
            space_id,
            body.name
        );
        return { data: folder };
    }

    @Post('integrations/:provider/folders/:folder_id/lists')
    @ApiOperation({ summary: 'Create a list in a folder' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiParam({ name: 'folder_id', description: 'Folder ID' })
    @ApiResponse({ status: 201, description: 'List created successfully' })
    async createList(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Param('folder_id') folder_id: string,
        @Body() body: { name: string }
    ): Promise<TypedResponse<IntegrationHierarchyItem>> {
        const list = await this.ticketIntegrationService.createList(
            org_id,
            provider,
            folder_id,
            body.name
        );
        return { data: list };
    }

    @Post('integrations/:provider/spaces/:space_id/lists')
    @ApiOperation({ summary: 'Create a folderless list directly in a space' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiParam({ name: 'space_id', description: 'Space ID' })
    @ApiResponse({ status: 201, description: 'List created successfully' })
    async createFolderlessList(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Param('space_id') space_id: string,
        @Body() body: { name: string }
    ): Promise<TypedResponse<IntegrationHierarchyItem>> {
        const list = await this.ticketIntegrationService.createFolderlessList(
            org_id,
            provider,
            space_id,
            body.name
        );
        return { data: list };
    }

    // ============================================
    // Ticket Sync Endpoints
    // ============================================

    @Get(':ticket_id/external-links')
    @ApiOperation({ summary: 'Get external links for a ticket' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiResponse({ status: 200, description: 'External links retrieved successfully' })
    async getExternalLinks(
        @AuthUser() _user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Param('ticket_id') ticket_id: string
    ): Promise<TypedResponse<TicketExternalLinkFrontend[]>> {
        const links = await this.ticketIntegrationService.getExternalLinks(ticket_id);
        const linksFrontend: TicketExternalLinkFrontend[] = links.map((l) => ({
            id: l.id,
            provider: l.provider,
            external_id: l.external_id,
            external_url: l.external_url,
            synced_on: l.synced_on,
            sync_enabled: l.sync_enabled
        }));
        return { data: linksFrontend };
    }

    @Post(':ticket_id/sync/:provider')
    @ApiOperation({ summary: 'Sync a ticket to an external provider' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiResponse({ status: 200, description: 'Ticket synced successfully' })
    async syncTicket(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Param('ticket_id') ticket_id: string,
        @Param('provider') provider: ExternalTicketProvider
    ): Promise<TypedResponse<SyncResult>> {
        const link = await this.ticketIntegrationService.syncTicketToExternal(
            ticket_id,
            provider,
            user.userId
        );
        return {
            data: {
                ticket_id,
                external_id: link.external_id,
                external_url: link.external_url,
                provider: link.provider
            }
        };
    }

    @Delete(':ticket_id/sync/:link_id')
    @ApiOperation({ summary: 'Unlink a ticket from an external provider' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiParam({ name: 'link_id', description: 'External link ID' })
    @ApiQuery({
        name: 'delete_external',
        required: false,
        description: 'Also delete from external system'
    })
    @ApiResponse({ status: 200, description: 'Ticket unlinked successfully' })
    async unlinkTicket(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Param('ticket_id') ticket_id: string,
        @Param('link_id') link_id: string,
        @Query('delete_external', new DefaultValuePipe(false), ParseBoolPipe)
        delete_external: boolean
    ): Promise<NoDataResponse> {
        await this.ticketIntegrationService.unlinkTicket(
            ticket_id,
            link_id,
            delete_external,
            user.userId
        );
        return {};
    }

    @Post('bulk-sync/:provider')
    @ApiOperation({ summary: 'Bulk sync multiple tickets to an external provider' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({
        name: 'provider',
        description: 'Integration provider',
        enum: ExternalTicketProvider
    })
    @ApiResponse({ status: 200, description: 'Bulk sync completed' })
    async bulkSync(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Param('provider') provider: ExternalTicketProvider,
        @Body() body: { ticket_ids: string[] }
    ): Promise<TypedResponse<BulkSyncResult>> {
        const result = await this.ticketIntegrationService.bulkSyncTickets(
            body.ticket_ids,
            provider,
            user.userId
        );

        return {
            data: {
                synced: result.synced.map((id) => ({
                    ticket_id: id,
                    external_id: '',
                    external_url: '',
                    provider
                })),
                failed: result.failed.map((f) => ({
                    ticket_id: f.id,
                    error: f.error
                }))
            }
        };
    }

    // ============================================
    // Sync FROM External Provider Endpoints
    // ============================================

    @Post(':ticket_id/sync-from-external/:link_id')
    @ApiOperation({
        summary: 'Sync ticket status from external provider',
        description:
            'Fetches the current status from the external provider and updates the CodeClarity ticket if changed. ' +
            'Use this for pull-based synchronization when webhooks are not available.'
    })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'ticket_id', description: 'Ticket ID' })
    @ApiParam({ name: 'link_id', description: 'External link ID' })
    @ApiResponse({ status: 200, description: 'Sync from external completed' })
    @ApiResponse({ status: 404, description: 'Ticket or external link not found' })
    async syncFromExternal(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Param('ticket_id') ticket_id: string,
        @Param('link_id') link_id: string
    ): Promise<TypedResponse<SyncFromExternalResult>> {
        const result = await this.ticketIntegrationService.syncFromExternal(
            ticket_id,
            link_id,
            user.userId
        );

        const data: SyncFromExternalResult = {
            ticket_id,
            updated: result.updated
        };

        if (result.oldStatus !== undefined) {
            data.old_status = result.oldStatus;
        }
        if (result.newStatus !== undefined) {
            data.new_status = result.newStatus;
        }
        if (result.externalStatus !== undefined) {
            data.external_status = result.externalStatus;
        }

        return { data };
    }

    @Post('bulk-sync-from-external')
    @ApiOperation({
        summary: 'Bulk sync ticket statuses from external providers',
        description:
            'Fetches current status from external providers for multiple tickets and updates CodeClarity tickets if changed. ' +
            'Use this to sync all linked tickets at once.'
    })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiResponse({ status: 200, description: 'Bulk sync from external completed' })
    async bulkSyncFromExternal(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') _org_id: string,
        @Body() body: { ticket_ids: string[] }
    ): Promise<TypedResponse<BulkSyncFromExternalResult>> {
        const result = await this.ticketIntegrationService.bulkSyncFromExternal(
            body.ticket_ids,
            user.userId
        );
        return {
            data: {
                updated: result.updated.map((u) => ({
                    ticket_id: u.ticketId,
                    updated: true,
                    old_status: u.oldStatus,
                    new_status: u.newStatus
                })),
                unchanged: result.unchanged,
                failed: result.failed.map((f) => ({
                    ticket_id: f.ticketId,
                    error: f.error
                }))
            }
        };
    }
}

// Project-scoped tickets controller
@ApiTags('Project Tickets')
@Controller('org/:org_id/projects/:project_id/tickets')
export class ProjectTicketsController {
    constructor(private readonly ticketsService: TicketsService) {}

    @Get('')
    @ApiOperation({ summary: 'Get all tickets for a specific project' })
    @ApiParam({ name: 'org_id', description: 'Organization ID' })
    @ApiParam({ name: 'project_id', description: 'Project ID' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (0-based)' })
    @ApiQuery({
        name: 'entries_per_page',
        required: false,
        description: 'Number of entries per page'
    })
    @ApiQuery({
        name: 'status',
        required: false,
        isArray: true,
        enum: TicketStatus,
        description: 'Filter by status'
    })
    @ApiResponse({ status: 200, description: 'Tickets retrieved successfully' })
    async getProjectTickets(
        @AuthUser() user: AuthenticatedUser,
        @Param('org_id') org_id: string,
        @Param('project_id') project_id: string,
        @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
        @Query('entries_per_page', new DefaultValuePipe(20), ParseIntPipe)
        entries_per_page?: number,
        @Query('status') status?: TicketStatus | TicketStatus[]
    ): Promise<TypedPaginatedResponse<TicketSummary>> {
        const filters = {
            project_id,
            status: normalizeQueryArray(status)
        };

        return await this.ticketsService.getMany(
            org_id,
            { currentPage: page, entriesPerPage: entries_per_page },
            user,
            filters
        );
    }
}
