import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import {
  LicensePolicyCreateBody,
  LicensePolicyPatchBody,
} from "src/codeclarity_modules/policies/license/licensePolicy.types";
import {
  Policy,
  POLICY_ANALYSES_TABLE,
  PolicyFrontend,
  toPolicyFrontend,
} from "src/codeclarity_modules/policies/policy.entity";
import { PolicyType } from "src/codeclarity_modules/policies/policy.types";
import { EntityNotFound } from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
  TypedPaginatedData,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";
import { paginatedData, resolvePage } from "src/utils/pagination";

@Injectable()
export class LicensePolicyService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly usersRepository: UsersRepository,
    @InjectRepository(Policy, "codeclarity")
    private policyRepository: Repository<Policy>,
  ) {}

  /**
   * Create a license policy
   * @param orgId The id of the organization
   * @param create The license policy data
   * @param user The authenticated user
   * @returns the id of the created license policy
   */
  async create(
    orgId: string,
    create: LicensePolicyCreateBody,
    user: AuthenticatedUser,
  ): Promise<string> {
    // Only owners and admins can add an policy to the org
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );

    const organization =
      await this.organizationsRepository.getOrganizationById(orgId);
    if (!organization) {
      throw new EntityNotFound();
    }

    const creator = await this.usersRepository.getUserById(user.userId);
    if (!creator) {
      throw new EntityNotFound();
    }

    const policy = await this.policyRepository.save({
      policy_type: PolicyType.LICENSE_POLICY,
      default: create.default,
      created_on: new Date(),
      created_by: creator,
      name: create.name,
      description: create.description,
      content: create.licenses,
      organizations: [organization],
      analyses: [],
    } as Partial<Policy>);

    return policy.id;
  }

  /**
   * Get a license policy
   * @param orgId The id of the org
   * @param licensePolicyId The id of the license policy
   * @param user The authenticated user
   * @returns the license policy
   */
  async get(
    orgId: string,
    licensePolicyId: string,
    user: AuthenticatedUser,
  ): Promise<Policy> {
    // (1) Check if user has access to org
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const policy = await this.policyRepository.findOne({
      where: {
        id: licensePolicyId,
        policy_type: PolicyType.LICENSE_POLICY,
        organizations: { id: orgId },
      },
      relations: { created_by: true },
    });

    if (!policy) {
      throw new EntityNotFound();
    }

    return policy;
  }

  /**
   * Get the license policies belonging to the org
   * @param orgId The id of the org
   * @param paginationUserSuppliedConf Paginiation configuration
   * @param user The authenticatéd user
   * @param searchKey A search key to filter the records by
   * @param sortBy A sort field to sort the records by
   * @param sortDirection A sort direction
   * @returns the license policies belonging to the org
   */
  async getMany(
    orgId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
    _searchKey?: string,
    _sortBy?: string,
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<PolicyFrontend>> {
    // Check if user has access to org
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const paginationConfig: PaginationConfig = {
      maxEntriesPerPage: 100,
      defaultEntriesPerPage: 10,
    };

    const { currentPage, entriesPerPage } = resolvePage(
      paginationUserSuppliedConf,
      paginationConfig,
      "as-requested",
    );

    const queryBuilder = this.policyRepository
      .createQueryBuilder("policy")
      .leftJoin("policy.organizations", "organization")
      .leftJoinAndSelect("policy.created_by", "creator")
      .where("organization.id = :orgId", { orgId })
      .andWhere("policy.policy_type = :policyType", {
        policyType: PolicyType.LICENSE_POLICY,
      })
      .orderBy("policy.name", "ASC")
      .addOrderBy("policy.id", "ASC");

    const fullCount = await queryBuilder.getCount();

    const policies = await queryBuilder
      .skip(currentPage * entriesPerPage)
      .take(entriesPerPage)
      .getMany();

    return paginatedData(policies.map(toPolicyFrontend), fullCount, {
      currentPage,
      entriesPerPage,
    });
  }

  /**
   * Update an existing license policy
   * @throws {EntityNotFound} if the license policy does not exist
   *
   * @param orgId The id of the organization to which the license policy belongs
   * @param licensePolicyId The id of the license policy
   * @param update The update
   * @param user The authenticated user
   */
  async update(
    orgId: string,
    licensePolicyId: string,
    update: LicensePolicyPatchBody,
    user: AuthenticatedUser,
  ): Promise<void> {
    // Only owners and admins can update an policy to the org
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );

    const policy = await this.findInOrg(orgId, licensePolicyId);

    const changes: Partial<Policy> = {};
    if (update.name !== undefined) changes.name = update.name;
    if (update.description !== undefined)
      changes.description = update.description;
    if (update.licenses !== undefined) changes.content = update.licenses;
    if (update.default !== undefined) changes.default = update.default;

    await this.policyRepository.manager.transaction(async (manager) => {
      const policies = manager.getRepository(Policy);
      // One default license policy per organization
      if (update.default === true) {
        const defaults = await policies
          .createQueryBuilder("policy")
          .innerJoin("policy.organizations", "organization")
          .where("organization.id = :orgId", { orgId })
          .andWhere("policy.policy_type = :policyType", {
            policyType: PolicyType.LICENSE_POLICY,
          })
          .andWhere("policy.default = true")
          .andWhere("policy.id != :id", { id: policy.id })
          .getMany();
        if (defaults.length > 0) {
          await policies.update(
            { id: In(defaults.map((other) => other.id)) },
            { default: false },
          );
        }
      }
      if (Object.keys(changes).length > 0) {
        await policies.update(policy.id, changes as Record<string, unknown>);
      }
    });
  }

  /**
   * Remove an existing license policy
   * @throws {EntityNotFound} if the license policy does not exist
   *
   * @param orgId The id of the organization to which the policy belongs
   * @param licensePolicyId The id of the license policy
   * @param user The authenticated user
   */
  async remove(
    orgId: string,
    licensePolicyId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    // Only owners and admins can remove an policy to the org
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );

    const policy = await this.findInOrg(orgId, licensePolicyId);

    // Analyses keep their results; only their links to the policy go
    await this.policyRepository.manager.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(POLICY_ANALYSES_TABLE)
        .where('"policyId" = :id', { id: policy.id })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from("organization_policies_policy")
        .where('"policyId" = :id', { id: policy.id })
        .execute();
      await manager.getRepository(Policy).delete(policy.id);
    });
  }

  // The organization's license policy with this id, or EntityNotFound
  private async findInOrg(orgId: string, policyId: string): Promise<Policy> {
    const policy = await this.policyRepository.findOne({
      where: {
        id: policyId,
        policy_type: PolicyType.LICENSE_POLICY,
        organizations: { id: orgId },
      },
    });
    if (!policy) {
      throw new EntityNotFound();
    }
    return policy;
  }
}
