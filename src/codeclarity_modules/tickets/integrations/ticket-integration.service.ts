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
        // Validate config with provider
        const providerInstance = this.getProvider(provider);
        await providerInstance.validateConfig(config);

        // Check for existing config
        let integrationConfig = await this.configRepository.findOne({
            where: {
                organization: { id: organizationId },
                provider
            }
        });

        const now = new Date();

        if (integrationConfig) {
            // Update existing
            integrationConfig.config = config;
            integrationConfig.enabled = enabled;
            integrationConfig.updated_on = now;
        } else {
            // Create new
            integrationConfig = this.configRepository.create({
                organization: { id: organizationId },
                provider,
                config,
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

                this.logger.log(`Updated external ticket ${link.external_id} status to ${status}`);
            } catch (error) {
                this.logger.error(
                    `Failed to update external ticket status for ${link.external_id}`,
                    error
                );
            }
        }
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
}
