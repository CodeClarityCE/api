import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEvent, TicketEventType } from '../ticket-event.entity';
import { TicketExternalLink, ExternalTicketProvider } from '../ticket-external-link.entity';
import {
    TicketIntegrationConfig,
    IntegrationConfig,
    ClickUpConfig
} from '../ticket-integration-config.entity';
import { Ticket, TicketStatus } from '../ticket.entity';
import {
    ITicketIntegrationProvider,
    ConnectionTestResult,
    ExternalWorkspace,
    ExternalSpace,
    ExternalFolder,
    ExternalList,
    OAuthTokenResponse
} from './integration-provider.interface';

/**
 * Service for managing external ticket integrations.
 * Handles provider registration, configuration, and sync operations.
 */
@Injectable()
export class TicketIntegrationService {
    private readonly logger = new Logger(TicketIntegrationService.name);
    private readonly providers = new Map<ExternalTicketProvider, ITicketIntegrationProvider>();

    constructor(
        @InjectRepository(TicketIntegrationConfig, 'codeclarity')
        private readonly configRepository: Repository<TicketIntegrationConfig>,
        @InjectRepository(TicketExternalLink, 'codeclarity')
        private readonly externalLinkRepository: Repository<TicketExternalLink>,
        @InjectRepository(TicketEvent, 'codeclarity')
        private readonly eventRepository: Repository<TicketEvent>,
        @InjectRepository(Ticket, 'codeclarity')
        private readonly ticketRepository: Repository<Ticket>
    ) {}

    /**
     * Register an integration provider
     */
    registerProvider(provider: ITicketIntegrationProvider): void {
        this.providers.set(provider.name, provider);
        this.logger.log(`Registered integration provider: ${provider.name}`);
    }

    /**
     * Get a registered provider
     */
    getProvider(name: ExternalTicketProvider): ITicketIntegrationProvider {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new BadRequestException(`Integration provider ${name} is not available`);
        }
        return provider;
    }

    /**
     * Check if a provider is registered
     */
    hasProvider(name: ExternalTicketProvider): boolean {
        return this.providers.has(name);
    }

    /**
     * Get all registered providers
     */
    getRegisteredProviders(): ExternalTicketProvider[] {
        return Array.from(this.providers.keys());
    }

    // ============================================
    // Configuration Management
    // ============================================

    /**
     * Get all integration configs for an organization
     */
    async getIntegrationConfigs(organizationId: string): Promise<TicketIntegrationConfig[]> {
        return this.configRepository.find({
            where: { organization: { id: organizationId } },
            order: { created_on: 'DESC' }
        });
    }

    /**
     * Get a specific integration config
     */
    async getIntegrationConfig(
        organizationId: string,
        provider: ExternalTicketProvider
    ): Promise<TicketIntegrationConfig | null> {
        return this.configRepository.findOne({
            where: {
                organization: { id: organizationId },
                provider
            }
        });
    }

    /**
     * Create or update an integration config
     */
    async saveIntegrationConfig(
        organizationId: string,
        provider: ExternalTicketProvider,
        config: IntegrationConfig,
        enabled = true
    ): Promise<TicketIntegrationConfig> {
        // Check for existing config first
        let integrationConfig = await this.configRepository.findOne({
            where: {
                organization: { id: organizationId },
                provider
            }
        });

        // Merge with existing config to preserve fields not being updated
        // This is important for OAuth tokens which are stored on backend
        // Filter out undefined and empty string values to avoid overwriting with empty data
        let mergedConfig = config;
        if (integrationConfig?.config) {
            const newValues = Object.fromEntries(
                Object.entries(config).filter(([, v]) => v !== undefined && v !== '')
            );
            mergedConfig = {
                ...integrationConfig.config,
                ...newValues
            } as IntegrationConfig;

            this.logger.debug(
                `Merging config - existing keys: ${Object.keys(integrationConfig.config).join(', ')}, new keys: ${Object.keys(newValues).join(', ')}`
            );
        }

        // Validate the merged config with provider
        const providerInstance = this.getProvider(provider);
        await providerInstance.validateConfig(mergedConfig);

        const now = new Date();

        if (integrationConfig) {
            // Update existing
            integrationConfig.config = mergedConfig;
            integrationConfig.enabled = enabled;
            integrationConfig.updated_on = now;
        } else {
            // Create new
            integrationConfig = this.configRepository.create({
                organization: { id: organizationId },
                provider,
                config: mergedConfig,
                enabled,
                created_on: now
            });
        }

        return this.configRepository.save(integrationConfig);
    }

    /**
     * Delete an integration config
     */
    async deleteIntegrationConfig(
        organizationId: string,
        provider: ExternalTicketProvider
    ): Promise<void> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        await this.configRepository.remove(config);
        this.logger.log(`Deleted ${provider} integration config for org ${organizationId}`);
    }

    /**
     * Toggle an integration's enabled status
     */
    async toggleIntegration(
        organizationId: string,
        provider: ExternalTicketProvider,
        enabled: boolean
    ): Promise<TicketIntegrationConfig> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        config.enabled = enabled;
        config.updated_on = new Date();
        return this.configRepository.save(config);
    }

    // ============================================
    // Connection Testing
    // ============================================

    /**
     * Test connection for an integration
     */
    async testConnection(
        organizationId: string,
        provider: ExternalTicketProvider
    ): Promise<ConnectionTestResult> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        return providerInstance.testConnection(config.config);
    }

    /**
     * Test connection with a temporary config (before saving)
     */
    async testConnectionWithConfig(
        provider: ExternalTicketProvider,
        config: IntegrationConfig
    ): Promise<ConnectionTestResult> {
        const providerInstance = this.getProvider(provider);
        return providerInstance.testConnection(config);
    }

    // ============================================
    // OAuth Flow
    // ============================================

    /**
     * Get OAuth authorization URL
     */
    getOAuthUrl(provider: ExternalTicketProvider, redirectUri: string, state: string): string {
        const providerInstance = this.getProvider(provider);
        if (!providerInstance.getAuthUrl) {
            throw new BadRequestException(`Provider ${provider} does not support OAuth`);
        }
        return providerInstance.getAuthUrl(redirectUri, state);
    }

    /**
     * Exchange OAuth code for tokens
     */
    async exchangeOAuthCode(
        provider: ExternalTicketProvider,
        code: string,
        redirectUri: string
    ): Promise<OAuthTokenResponse> {
        const providerInstance = this.getProvider(provider);
        if (!providerInstance.exchangeCodeForToken) {
            throw new BadRequestException(`Provider ${provider} does not support OAuth`);
        }
        return providerInstance.exchangeCodeForToken(code, redirectUri);
    }

    /**
     * Refresh OAuth token
     */
    async refreshOAuthToken(
        organizationId: string,
        provider: ExternalTicketProvider
    ): Promise<OAuthTokenResponse> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.refreshToken) {
            throw new BadRequestException(`Provider ${provider} does not support token refresh`);
        }

        const clickUpConfig = config.config as ClickUpConfig;
        if (!clickUpConfig.refresh_token) {
            throw new BadRequestException('No refresh token available');
        }

        const tokens = await providerInstance.refreshToken(clickUpConfig.refresh_token);

        // Update config with new tokens
        clickUpConfig.access_token = tokens.access_token;
        if (tokens.refresh_token) {
            clickUpConfig.refresh_token = tokens.refresh_token;
        }
        if (tokens.expires_in) {
            clickUpConfig.token_expiry = new Date(Date.now() + tokens.expires_in * 1000);
        }

        config.config = clickUpConfig;
        config.updated_on = new Date();
        await this.configRepository.save(config);

        return tokens;
    }

    // ============================================
    // Hierarchy Fetching (Workspaces, Lists, etc.)
    // ============================================

    /**
     * Get workspaces for a provider
     */
    async getWorkspaces(
        organizationId: string,
        provider: ExternalTicketProvider
    ): Promise<ExternalWorkspace[]> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.getWorkspaces) {
            throw new BadRequestException(`Provider ${provider} does not support workspaces`);
        }

        return providerInstance.getWorkspaces(config.config);
    }

    /**
     * Get spaces within a workspace
     */
    async getSpaces(
        organizationId: string,
        provider: ExternalTicketProvider,
        workspaceId: string
    ): Promise<ExternalSpace[]> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.getSpaces) {
            throw new BadRequestException(`Provider ${provider} does not support spaces`);
        }

        return providerInstance.getSpaces(workspaceId, config.config);
    }

    /**
     * Get folders within a space
     */
    async getFolders(
        organizationId: string,
        provider: ExternalTicketProvider,
        spaceId: string
    ): Promise<ExternalFolder[]> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.getFolders) {
            throw new BadRequestException(`Provider ${provider} does not support folders`);
        }

        return providerInstance.getFolders(spaceId, config.config);
    }

    /**
     * Get lists within a folder or space
     */
    async getLists(
        organizationId: string,
        provider: ExternalTicketProvider,
        parentId: string
    ): Promise<ExternalList[]> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.getLists) {
            throw new BadRequestException(`Provider ${provider} does not support lists`);
        }

        return providerInstance.getLists(parentId, config.config);
    }

    // ============================================
    // Hierarchy Creation
    // ============================================

    /**
     * Create a space within a workspace
     */
    async createSpace(
        organizationId: string,
        provider: ExternalTicketProvider,
        workspaceId: string,
        name: string
    ): Promise<ExternalSpace> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.createSpace) {
            throw new BadRequestException(`Provider ${provider} does not support creating spaces`);
        }

        return providerInstance.createSpace(name, workspaceId, config.config);
    }

    /**
     * Create a folder within a space
     */
    async createFolder(
        organizationId: string,
        provider: ExternalTicketProvider,
        spaceId: string,
        name: string
    ): Promise<ExternalFolder> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.createFolder) {
            throw new BadRequestException(`Provider ${provider} does not support creating folders`);
        }

        return providerInstance.createFolder(name, spaceId, config.config);
    }

    /**
     * Create a list within a folder
     */
    async createList(
        organizationId: string,
        provider: ExternalTicketProvider,
        folderId: string,
        name: string
    ): Promise<ExternalList> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.createList) {
            throw new BadRequestException(`Provider ${provider} does not support creating lists`);
        }

        return providerInstance.createList(name, folderId, config.config);
    }

    /**
     * Create a folderless list directly in a space
     */
    async createFolderlessList(
        organizationId: string,
        provider: ExternalTicketProvider,
        spaceId: string,
        name: string
    ): Promise<ExternalList> {
        const config = await this.getIntegrationConfig(organizationId, provider);
        if (!config) {
            throw new NotFoundException(`Integration config for ${provider} not found`);
        }

        const providerInstance = this.getProvider(provider);
        if (!providerInstance.createFolderlessList) {
            throw new BadRequestException(
                `Provider ${provider} does not support creating folderless lists`
            );
        }

        return providerInstance.createFolderlessList(name, spaceId, config.config);
    }

    // ============================================
    // Ticket Sync Operations
    // ============================================

    /**
     * Sync a ticket to an external provider
     */
    async syncTicketToExternal(
        ticketId: string,
        provider: ExternalTicketProvider,
        userId?: string
    ): Promise<TicketExternalLink> {
        // Get ticket with organization
        const ticket = await this.ticketRepository.findOne({
            where: { id: ticketId },
            relations: ['organization', 'project', 'external_links']
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket ${ticketId} not found`);
        }

        // Check if already synced
        const existingLink = ticket.external_links?.find((l) => l.provider === provider);
        if (existingLink) {
            throw new BadRequestException(`Ticket is already synced to ${provider}`);
        }

        // Get integration config
        const config = await this.getIntegrationConfig(ticket.organization.id, provider);
        if (!config?.enabled) {
            throw new BadRequestException(
                `${provider} integration is not configured or enabled for this organization`
            );
        }

        // Create external ticket
        const providerInstance = this.getProvider(provider);
        const result = await providerInstance.createExternalTicket(ticket, config.config);

        // Create external link
        const externalLink = this.externalLinkRepository.create({
            ticket: { id: ticketId },
            provider,
            external_id: result.external_id,
            external_url: result.external_url,
            synced_on: new Date(),
            sync_enabled: true
        });

        await this.externalLinkRepository.save(externalLink);

        // Create event
        const eventData = {
            ticket: { id: ticketId },
            event_type: TicketEventType.SYNCED_EXTERNAL,
            event_data: {
                external_provider: provider,
                external_id: result.external_id,
                external_url: result.external_url,
                source: 'manual' as const
            },
            created_on: new Date()
        };
        const event = userId
            ? this.eventRepository.create({ ...eventData, performed_by: { id: userId } })
            : this.eventRepository.create(eventData);
        await this.eventRepository.save(event);

        this.logger.log(`Synced ticket ${ticketId} to ${provider}: ${result.external_id}`);

        return externalLink;
    }

    /**
     * Update external ticket when CodeClarity ticket changes
     */
    async updateExternalTicket(ticketId: string, linkId: string): Promise<void> {
        const externalLink = await this.externalLinkRepository.findOne({
            where: { id: linkId, ticket: { id: ticketId } },
            relations: ['ticket', 'ticket.organization']
        });

        if (!externalLink) {
            throw new NotFoundException(`External link ${linkId} not found`);
        }

        if (!externalLink.sync_enabled) {
            this.logger.warn(`Sync disabled for link ${linkId}, skipping external update`);
            return;
        }

        const ticket = await this.ticketRepository.findOne({
            where: { id: ticketId },
            relations: ['organization', 'project']
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket ${ticketId} not found`);
        }

        const config = await this.getIntegrationConfig(
            ticket.organization.id,
            externalLink.provider
        );

        if (!config?.enabled) {
            this.logger.warn(`${externalLink.provider} integration disabled, skipping update`);
            return;
        }

        const providerInstance = this.getProvider(externalLink.provider);
        await providerInstance.updateExternalTicket(
            ticket,
            externalLink.external_id,
            config.config
        );

        // Update synced_on timestamp
        externalLink.synced_on = new Date();
        await this.externalLinkRepository.save(externalLink);

        this.logger.log(
            `Updated external ticket ${externalLink.external_id} for ticket ${ticketId}`
        );
    }

    /**
     * Update external ticket status only
     */
    async updateExternalTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
        const ticket = await this.ticketRepository.findOne({
            where: { id: ticketId },
            relations: ['organization', 'external_links']
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket ${ticketId} not found`);
        }

        let externalStatusUpdated = false;

        for (const link of ticket.external_links || []) {
            if (!link.sync_enabled) continue;

            const config = await this.getIntegrationConfig(ticket.organization.id, link.provider);

            if (!config?.enabled) continue;

            // Check if status sync is enabled in config
            const clickUpConfig = config.config as ClickUpConfig;
            if (clickUpConfig.sync_status_changes === false) continue;

            try {
                const providerInstance = this.getProvider(link.provider);
                await providerInstance.updateExternalTicketStatus(
                    status,
                    link.external_id,
                    config.config
                );

                link.synced_on = new Date();
                await this.externalLinkRepository.save(link);

                // Also update the ticket's external_status to reflect what we sent to the provider
                // Map CodeClarity status to external provider status name
                const externalStatusName = this.mapCodeClarityStatusToExternal(status);
                if (externalStatusName && ticket.external_status !== externalStatusName) {
                    ticket.external_status = externalStatusName;
                    externalStatusUpdated = true;
                }

                this.logger.log(`Updated external ticket ${link.external_id} status to ${status}`);
            } catch (error) {
                this.logger.error(
                    `Failed to update external ticket status for ${link.external_id}`,
                    error
                );
            }
        }

        // Save the ticket if external_status was updated
        if (externalStatusUpdated) {
            await this.ticketRepository.save(ticket);
        }
    }

    /**
     * Map CodeClarity status to external provider status name
     */
    private mapCodeClarityStatusToExternal(status: TicketStatus): string {
        // These are the ClickUp default status names
        const statusMapping: Record<TicketStatus, string> = {
            [TicketStatus.OPEN]: 'to do',
            [TicketStatus.IN_PROGRESS]: 'in progress',
            [TicketStatus.RESOLVED]: 'complete',
            [TicketStatus.CLOSED]: 'complete',
            [TicketStatus.WONT_FIX]: 'complete'
        };
        return statusMapping[status];
    }

    /**
     * Unlink a ticket from an external provider
     */
    async unlinkTicket(
        ticketId: string,
        linkId: string,
        deleteExternal = false,
        userId?: string
    ): Promise<void> {
        const externalLink = await this.externalLinkRepository.findOne({
            where: { id: linkId, ticket: { id: ticketId } },
            relations: ['ticket', 'ticket.organization']
        });

        if (!externalLink) {
            throw new NotFoundException(`External link ${linkId} not found`);
        }

        // Optionally delete from external system
        if (deleteExternal) {
            const config = await this.getIntegrationConfig(
                externalLink.ticket.organization.id,
                externalLink.provider
            );

            if (config) {
                try {
                    const providerInstance = this.getProvider(externalLink.provider);
                    await providerInstance.deleteExternalTicket(
                        externalLink.external_id,
                        config.config
                    );
                } catch (error) {
                    this.logger.error(
                        `Failed to delete external ticket ${externalLink.external_id}`,
                        error
                    );
                }
            }
        }

        // Remove link
        await this.externalLinkRepository.remove(externalLink);

        // Create event
        const eventSource: 'manual' | 'sync' = deleteExternal ? 'manual' : 'sync';
        const unlinkEventData = {
            ticket: { id: ticketId },
            event_type: TicketEventType.UNLINKED_EXTERNAL,
            event_data: {
                external_provider: externalLink.provider,
                external_id: externalLink.external_id,
                source: eventSource
            },
            created_on: new Date()
        };
        const event = userId
            ? this.eventRepository.create({ ...unlinkEventData, performed_by: { id: userId } })
            : this.eventRepository.create(unlinkEventData);
        await this.eventRepository.save(event);

        this.logger.log(
            `Unlinked ticket ${ticketId} from ${externalLink.provider} (external_id: ${externalLink.external_id})`
        );
    }

    /**
     * Get external links for a ticket
     */
    async getExternalLinks(ticketId: string): Promise<TicketExternalLink[]> {
        return this.externalLinkRepository.find({
            where: { ticket: { id: ticketId } },
            order: { synced_on: 'DESC' }
        });
    }

    /**
     * Bulk sync tickets to external provider
     */
    async bulkSyncTickets(
        ticketIds: string[],
        provider: ExternalTicketProvider,
        userId?: string
    ): Promise<{ synced: string[]; failed: { id: string; error: string }[] }> {
        const results = {
            synced: [] as string[],
            failed: [] as { id: string; error: string }[]
        };

        for (const ticketId of ticketIds) {
            try {
                await this.syncTicketToExternal(ticketId, provider, userId);
                results.synced.push(ticketId);
            } catch (error) {
                results.failed.push({
                    id: ticketId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }

    /**
     * Sync ticket status from external provider
     * Fetches the current status from the external system and updates the local ticket if changed
     */
    async syncFromExternal(
        ticketId: string,
        linkId: string,
        userId?: string
    ): Promise<{ updated: boolean; externalStatusUpdated: boolean; oldStatus?: TicketStatus; newStatus?: TicketStatus; externalStatus?: string }> {
        const externalLink = await this.externalLinkRepository.findOne({
            where: { id: linkId, ticket: { id: ticketId } },
            relations: ['ticket', 'ticket.organization']
        });

        if (!externalLink) {
            throw new NotFoundException(`External link ${linkId} not found`);
        }

        const ticket = externalLink.ticket;
        const config = await this.getIntegrationConfig(
            ticket.organization.id,
            externalLink.provider
        );

        if (!config) {
            throw new BadRequestException(
                `Integration ${externalLink.provider} is not configured for this organization`
            );
        }

        // Get the provider and fetch external status
        const provider = this.getProvider(externalLink.provider);

        // Check if provider supports getExternalTaskStatus
        if (!('getExternalTaskStatus' in provider)) {
            throw new BadRequestException(
                `Provider ${externalLink.provider} does not support status sync from external`
            );
        }

        const { status: externalStatus, externalStatus: rawExternalStatus } = await (
            provider as { getExternalTaskStatus: (id: string, config: IntegrationConfig) => Promise<{ status: TicketStatus; externalStatus: string }> }
        ).getExternalTaskStatus(externalLink.external_id, config.config);

        // Check what changed
        const statusChanged = ticket.status !== externalStatus;
        const externalStatusChanged = ticket.external_status !== rawExternalStatus;
        const oldStatus = ticket.status;

        // Always update external_status (raw status from provider like "to do", "in progress")
        ticket.external_status = rawExternalStatus;

        // Handle status change if the mapped status changed
        let isReopening = false;
        if (statusChanged) {
            ticket.status = externalStatus;
            ticket.updated_on = new Date();

            // If status changed to RESOLVED, set resolved_on
            if (externalStatus === TicketStatus.RESOLVED && !ticket.resolved_on) {
                ticket.resolved_on = new Date();
            }

            // If reopening (was RESOLVED, now OPEN or IN_PROGRESS), clear resolved_on
            isReopening =
                oldStatus === TicketStatus.RESOLVED &&
                (externalStatus === TicketStatus.OPEN || externalStatus === TicketStatus.IN_PROGRESS);
            if (isReopening) {
                ticket.resolved_on = undefined;
            }
        }

        // Save ticket if anything changed
        if (statusChanged || externalStatusChanged) {
            await this.ticketRepository.save(ticket);
        }

        // Always update sync timestamp on the link
        externalLink.synced_on = new Date();
        await this.externalLinkRepository.save(externalLink);

        // Only create event if status changed (not for external_status only changes)
        if (statusChanged) {
            const eventType = isReopening
                ? TicketEventType.REOPENED
                : TicketEventType.SYNCED_FROM_EXTERNAL;
            const eventData = {
                ticket: { id: ticketId },
                event_type: eventType,
                event_data: {
                    external_provider: externalLink.provider,
                    external_id: externalLink.external_id,
                    old_status: oldStatus,
                    new_status: externalStatus,
                    external_status: rawExternalStatus,
                    source: 'sync' as const
                },
                created_on: new Date()
            };
            const event = userId
                ? this.eventRepository.create({ ...eventData, performed_by: { id: userId } })
                : this.eventRepository.create(eventData);
            await this.eventRepository.save(event);

            this.logger.log(
                `Synced ticket ${ticketId} from ${externalLink.provider}: ${oldStatus} -> ${externalStatus}`
            );
        } else if (externalStatusChanged) {
            this.logger.log(
                `Updated external_status for ticket ${ticketId}: ${rawExternalStatus}`
            );
        } else {
            this.logger.log(
                `Ticket ${ticketId} unchanged (status: ${ticket.status}, external: ${rawExternalStatus})`
            );
        }

        const result: { updated: boolean; externalStatusUpdated: boolean; oldStatus?: TicketStatus; newStatus?: TicketStatus; externalStatus?: string } = {
            updated: statusChanged,
            externalStatusUpdated: externalStatusChanged,
            externalStatus: rawExternalStatus
        };
        if (statusChanged) {
            result.oldStatus = oldStatus;
            result.newStatus = externalStatus;
        }
        return result;
    }

    /**
     * Bulk sync tickets from external providers
     */
    async bulkSyncFromExternal(
        ticketIds: string[],
        userId?: string
    ): Promise<{
        updated: { ticketId: string; oldStatus: TicketStatus; newStatus: TicketStatus }[];
        unchanged: string[];
        failed: { ticketId: string; error: string }[];
    }> {
        const results = {
            updated: [] as { ticketId: string; oldStatus: TicketStatus; newStatus: TicketStatus }[],
            unchanged: [] as string[],
            failed: [] as { ticketId: string; error: string }[]
        };

        for (const ticketId of ticketIds) {
            try {
                // Get all external links for this ticket
                const links = await this.getExternalLinks(ticketId);

                if (links.length === 0) {
                    results.unchanged.push(ticketId);
                    continue;
                }

                // Sync from the first (most recent) link
                const link = links[0]!;
                const result = await this.syncFromExternal(ticketId, link.id, userId);

                if (result.updated && result.oldStatus && result.newStatus) {
                    results.updated.push({
                        ticketId,
                        oldStatus: result.oldStatus,
                        newStatus: result.newStatus
                    });
                } else {
                    results.unchanged.push(ticketId);
                }
            } catch (error) {
                results.failed.push({
                    ticketId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }
}
