import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import { Organization } from "src/base_modules/organizations/organization.entity";
import { EntityNotFound } from "src/types/error.types";

/**
 * Pure repository for organization database operations.
 * Does NOT depend on other repositories - cross-entity logic belongs in services.
 */
@Injectable()
export class OrganizationsRepository {
  constructor(
    @InjectRepository(Organization, "codeclarity")
    private organizationRepository: Repository<Organization>,
  ) {}

  /**
   * Retrieve an organization by its ID.
   * @throws {EntityNotFound} If no organization with the given ID exists.
   */
  async getOrganizationById(
    orgId: string,
    relations?: object,
  ): Promise<Organization> {
    const organization = await this.organizationRepository.findOne({
      where: { id: orgId },
      ...(relations ? { relations: relations } : {}),
    });

    if (!organization) {
      throw new EntityNotFound();
    }

    return organization;
  }

  /**
   * Delete an organization by its ID.
   * @param manager Runs the delete in the caller's transaction when given.
   */
  async deleteOrganization(
    organizationId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo =
      manager?.getRepository(Organization) ?? this.organizationRepository;
    await repo.delete({ id: organizationId });
  }

  /**
   * Run work in one database transaction; it rolls back if work throws.
   */
  async runInTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.organizationRepository.manager.transaction(work);
  }

  /**
   * Save an organization entity to the database.
   */
  async saveOrganization(organization: Organization): Promise<Organization> {
    return this.organizationRepository.save(organization);
  }

  /**
   * Check if an integration belongs to a specific organization.
   */
  async doesIntegrationBelongToOrg(
    integrationId: string,
    orgId: string,
  ): Promise<boolean> {
    return this.organizationRepository.exists({
      relations: { integrations: true },
      where: {
        id: orgId,
        integrations: { id: integrationId },
      },
    });
  }
}
