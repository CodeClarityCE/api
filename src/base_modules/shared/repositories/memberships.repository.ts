import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import type { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  MemberRole,
  OrganizationMemberships,
} from "src/base_modules/organizations/memberships/organization.memberships.entity";
import { isMemberRoleLessThan } from "src/base_modules/organizations/memberships/orgMembership.types";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";
import { TypedPaginatedData } from "src/types/pagination.types";

/**
 * Pure repository for organization membership database operations.
 */
@Injectable()
export class MembershipsRepository {
  constructor(
    @InjectRepository(OrganizationMemberships, "codeclarity")
    private membershipRepository: Repository<OrganizationMemberships>,
  ) {}

  /**
   * Retrieve memberships for an organization.
   */
  async getMembershipsByOrganizationId(
    organizationId: string,
    relations?: object,
  ): Promise<OrganizationMemberships[]> {
    const memberships = await this.membershipRepository.find({
      where: {
        organization: { id: organizationId },
      },
      ...(relations ? { relations: relations } : {}),
    });

    if (!memberships) {
      throw new EntityNotFound();
    }

    return memberships;
  }

  /**
   * Remove multiple memberships from the database.
   * @param manager Runs the removal in the caller's transaction when given.
   */
  async removeMemberships(
    memberships: OrganizationMemberships[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo =
      manager?.getRepository(OrganizationMemberships) ??
      this.membershipRepository;
    await repo.remove(memberships);
  }

  /**
   * Remove all memberships for a user.
   */
  async removeUserMemberships(userId: string): Promise<void> {
    const memberships = await this.membershipRepository.find({
      where: { user: { id: userId } },
    });
    await this.membershipRepository.remove(memberships);
  }

  /**
   * Remove a user's membership in a specific organization.
   */
  async leaveOrganization(
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const memberships = await this.membershipRepository.find({
      where: {
        user: { id: userId },
        organization: { id: organizationId },
      },
    });
    await this.membershipRepository.remove(memberships);
    return "User has left the organization. Membership removed successfully.";
  }

  /**
   * Retrieve the membership role of a user in a specific organization.
   * @throws {EntityNotFound} If no membership exists for the given user in the organization.
   */
  async getMembershipRole(
    orgId: string,
    userId: string,
  ): Promise<OrganizationMemberships> {
    const membership = await this.membershipRepository.findOne({
      relations: { organization: true },
      where: {
        organization: { id: orgId },
        user: { id: userId },
      },
      select: { role: true, organizationMembershipId: true },
    });

    if (!membership) {
      throw new EntityNotFound();
    }

    return membership;
  }

  /**
   * Check if a user has the required role in an organization.
   * @throws {NotAuthorized} If the user does not have the required role or is not a member.
   */
  async hasRequiredRole(
    organizationId: string,
    userId: string,
    requiredRole: MemberRole,
  ): Promise<void> {
    try {
      const memberRole = (await this.getMembershipRole(organizationId, userId))
        .role;

      if (isMemberRoleLessThan(memberRole, requiredRole)) {
        throw new NotAuthorized();
      }
    } catch (err) {
      if (err instanceof EntityNotFound) {
        throw new NotAuthorized();
      }
      throw err;
    }
  }

  /**
   * Like hasRequiredRole, for the request's actor: an Organization token counts
   * as a plain member of its own organization and of no other.
   * @throws {NotAuthorized}
   */
  async hasRequiredRoleFor(
    organizationId: string,
    actor: AuthenticatedUser,
    requiredRole: MemberRole,
  ): Promise<void> {
    const token = actor.organizationToken;
    if (!token) {
      return this.hasRequiredRole(organizationId, actor.userId, requiredRole);
    }
    if (
      token.organizationId !== organizationId ||
      isMemberRoleLessThan(MemberRole.USER, requiredRole)
    ) {
      throw new NotAuthorized();
    }
  }

  /**
   * Save an organization membership entity to the database.
   */
  async saveMembership(
    membership: OrganizationMemberships,
  ): Promise<OrganizationMemberships> {
    return this.membershipRepository.save(membership);
  }

  /**
   * Get membership for a specific organization and user.
   */
  async getMembershipByOrganizationAndUser(
    organizationId: string,
    userId: string,
    relations?: object,
  ): Promise<OrganizationMemberships> {
    const membership = await this.membershipRepository.findOne({
      where: {
        organization: { id: organizationId },
        user: { id: userId },
      },
      ...(relations ? { relations: relations } : {}),
    });

    if (!membership) {
      throw new EntityNotFound();
    }
    return membership;
  }

  /**
   * Get all organizations a user belongs to.
   */
  async getOrganizationsOfUser(
    userId: string,
    currentPage: number,
    entriesPerPage: number,
  ): Promise<TypedPaginatedData<OrganizationMemberships>> {
    const [memberships, fullCount] =
      await this.membershipRepository.findAndCount({
        where: { user: { id: userId } },
        relations: {
          organization: {
            owners: true,
            created_by: true,
            organizationMemberships: true,
          },
          user: true,
        },
        order: { joined_on: "ASC", organization: { name: "ASC" } },
        take: entriesPerPage,
        skip: currentPage * entriesPerPage,
      });
    return paginated(memberships, fullCount, currentPage, entriesPerPage);
  }

  /**
   * Retrieve one page of an organization's members, owners first.
   */
  async getMembersPage(
    organizationId: string,
    currentPage: number,
    entriesPerPage: number,
  ): Promise<TypedPaginatedData<OrganizationMemberships>> {
    const [memberships, fullCount] =
      await this.membershipRepository.findAndCount({
        where: { organization: { id: organizationId } },
        relations: { organization: true, user: true },
        order: { role: "ASC", joined_on: "ASC" },
        take: entriesPerPage,
        skip: currentPage * entriesPerPage,
      });
    return paginated(memberships, fullCount, currentPage, entriesPerPage);
  }

  /**
   * Count members in an organization.
   */
  async countMembers(organizationId: string): Promise<number> {
    return this.membershipRepository.count({
      where: { organization: { id: organizationId } },
    });
  }
}

function paginated<T>(
  data: T[],
  fullCount: number,
  currentPage: number,
  entriesPerPage: number,
): TypedPaginatedData<T> {
  return {
    data,
    page: currentPage,
    entry_count: data.length,
    entries_per_page: entriesPerPage,
    total_entries: fullCount,
    total_pages: Math.ceil(fullCount / entriesPerPage),
    matching_count: fullCount,
    filter_count: {},
  };
}
