import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { TypedPaginatedResponse } from 'src/types/apiResponses.types';
import { EntityNotFound, NotAuthorized } from 'src/types/error.types';
import { Repository } from 'typeorm';

@Injectable()
export class IntegrationsRepository {
    constructor(
        @InjectRepository(Integration, 'codeclarity')
        private integrationRepository: Repository<Integration>
    ) {}

    /**
     * Retrieves an integration by its ID.
     * @param integrationId - The ID of the integration to retrieve.
     * @returns The Integration object if found.
     * @throws EntityNotFound - If no integration is found with the given ID.
     */
    async getIntegrationById(integrationId: string, relations?: any): Promise<Integration> {
        const integration = await this.integrationRepository.findOne({
            where: { id: integrationId },
            relations: relations
        });

        if (!integration) {
            throw new EntityNotFound();
        }
        return integration;
    }

    /**
     * Retrieves an integration by its ID, ensuring it belongs to a specific organization and user.
     * @param integrationId - The ID of the integration to retrieve.
     * @param organizationId - The ID of the organization the integration should belong to.
     * @param userId - The ID of the user associated with the integration.
     * @returns The Integration object if found and authorized.
     * @throws EntityNotFound - If no integration is found with the given ID.
     * @throws NotAuthorized - If the integration does not belong to the specified organization.
     */
    async getIntegrationByIdAndOrganizationAndUser(
        integrationId: string,
        organizationId: string,
        userId: string
    ): Promise<Integration> {
        const integration = await this.integrationRepository.findOne({
            relations: {
                organizations: true,
                users: true
            },
            where: {
                id: integrationId,
                organizations: {
                    id: organizationId
                },
                users: {
                    id: userId
                }
            }
        });

        if (!integration) {
            throw new EntityNotFound();
        }

        // Check that the integration belongs to the specified organization.
        if (integration.organizations.find((org) => org.id === organizationId) === undefined) {
            throw new NotAuthorized();
        }
        return integration;
    }

    /**
     * Retrieves a paginated list of VCS integrations for a specific organization.
     * @param orgId - The ID of the organization to retrieve integrations for.
     * @param currentPage - The current page number (0-indexed).
     * @param entriesPerPage - The number of entries per page.
     * @returns A paginated response containing the list of integrations and pagination details.
     */
    async getVCSIntegrations(
        orgId: string,
        currentPage: number,
        entriesPerPage: number
    ): Promise<TypedPaginatedResponse<Integration>> {
        const integrations = await this.integrationRepository.find({
            relations: {
                organizations: true
            },
            where: {
                organizations: {
                    id: orgId
                }
            },
            take: entriesPerPage,
            skip: currentPage * entriesPerPage
        });

        const fullCount = await this.integrationRepository.count({
            relations: {
                organizations: true
            },
            where: {
                organizations: {
                    id: orgId
                }
            }
        });

        return {
            data: integrations,
            page: currentPage,
            entry_count: integrations.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: fullCount, // Adjust this once filters are applied
            filter_count: {}
        };
    }

    /**
     * Saves an integration to the database.
     * @param integration - The Integration object to save.
     * @returns The saved Integration object.
     */
    async saveIntegration(integration: Integration): Promise<Integration> {
        return this.integrationRepository.save(integration);
    }

    /**
     * Deletes an integration by its ID.
     * @param integrationId - The ID of the integration to delete.
     */
    async deleteIntegration(integrationId: string) {
        const integration = await this.integrationRepository.findOne({
            where: { id: integrationId },
            relations: { users: true, owner: true, organizations: true }
        });
        if (!integration) {
            throw new EntityNotFound();
        }
        integration.organizations = [];
        integration.users = [];

        const filtered = integration.owner.integrations?.filter(
            (integration) => integration.id !== integrationId
        );
        if (filtered !== undefined) {
            integration.owner.integrations = filtered;
        }

        await this.integrationRepository.save(integration);

        await this.integrationRepository.delete(integrationId);
    }
}
