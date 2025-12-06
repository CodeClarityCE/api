import {
    Body,
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { AuthUser } from 'src/decorators/UserDecorator';
import {
    CreatedResponse,
    NoDataResponse,
    TypedPaginatedResponse,
    TypedResponse
} from 'src/types/apiResponses.types';
import { SortDirection } from 'src/types/sort.types';
import { TicketEventFrontend } from './ticket-event.entity';
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
    TicketSortField
} from './tickets.types';

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
    constructor(private readonly ticketsService: TicketsService) {}

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
