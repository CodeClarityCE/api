import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Integration } from "src/base_modules/integrations/integrations.entity";
import { TypedPaginatedResponse } from "src/types/apiResponses.types";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";

/**
 * Pure repository for integration database operations.
 * Does NOT depend on other repositories - cross-entity logic belongs in services.
 */
@Injectable()
export class IntegrationsRepository {
  constructor(
    @InjectRepository(Integration, "codeclarity")
    private integrationRepository: Repository<Integration>,
  ) {}

  /**
   * Get an integration by ID.
   * @throws {EntityNotFound} if not found.
   */
  async getIntegrationById(
    integrationId: string,
    relations?: string[] | Record<string, boolean>,
  ): Promise<Integration> {
    const findOptions: { where: { id: string }; relations?: string[] } = {
      where: { id: integrationId },
    };
    if (relations) {
      findOptions.relations = relations as string[];
    }
    const integration = await this.integrationRepository.findOne(findOptions);

    if (!integration) {
      throw new EntityNotFound();
    }
    return integration;
  }

  /**
   * Get an integration by ID, organization, and user.
   * @throws {EntityNotFound} if not found.
   * @throws {NotAuthorized} if the integration does not belong to the specified organization.
   */
  async getIntegrationByIdAndOrganizationAndUser(
    integrationId: string,
    organizationId: string,
    userId: string,
  ): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      relations: {
        organizations: true,
        users: true,
      },
      where: {
        id: integrationId,
        organizations: { id: organizationId },
        users: { id: userId },
      },
    });

    if (!integration) {
      throw new EntityNotFound();
    }

    if (
      integration.organizations.find((org) => org.id === organizationId) ===
      undefined
    ) {
      throw new NotAuthorized();
    }
    return integration;
  }

  /**
   * Get paginated VCS integrations for an organization.
   */
  async getVCSIntegrations(
    orgId: string,
    currentPage: number,
    entriesPerPage: number,
  ): Promise<TypedPaginatedResponse<Integration>> {
    const integrations = await this.integrationRepository.find({
      relations: { organizations: true },
      where: { organizations: { id: orgId } },
      take: entriesPerPage,
      skip: currentPage * entriesPerPage,
    });

    const fullCount = await this.integrationRepository.count({
      relations: { organizations: true },
      where: { organizations: { id: orgId } },
    });

    return {
      data: integrations,
      page: currentPage,
      entry_count: integrations.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: fullCount,
      filter_count: {},
    };
  }

  /**
   * Save an integration.
   */
  async saveIntegration(integration: Integration): Promise<Integration> {
    return this.integrationRepository.save(integration);
  }

  /**
   * Delete an integration by ID.
   * Note: This performs cleanup of relationships before deletion.
   */
  async deleteIntegration(integrationId: string): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId },
      relations: { users: true, owner: true, organizations: true },
    });
    if (!integration) {
      throw new EntityNotFound();
    }
    integration.organizations = [];
    integration.users = [];

    const filtered = integration.owner.integrations?.filter(
      (int) => int.id !== integrationId,
    );
    if (filtered !== undefined) {
      integration.owner.integrations = filtered;
    }

    await this.integrationRepository.save(integration);
    await this.integrationRepository.delete(integrationId);
  }
}
