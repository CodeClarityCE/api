import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  MemberRole,
  OrganizationMemberships,
} from "src/base_modules/organizations/memberships/organization.memberships.entity";
import { isMemberRoleLessThan } from "src/base_modules/organizations/memberships/orgMembership.types";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";
import { TypedPaginatedData } from "src/types/pagination.types";
import { Repository } from "typeorm";

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
   */
  async removeMemberships(
    memberships: OrganizationMemberships[],
  ): Promise<void> {
    await this.membershipRepository.remove(memberships);
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
  ): Promise<TypedPaginatedData<object>> {
    const memberships = await this.membershipRepository.find({
      where: { user: { id: userId } },
      relations: {
        organization: {
          owners: true,
          created_by: true,
          organizationMemberships: true,
        },
        user: true,
      },
    });

    return {
      data: memberships,
      page: 1,
      entry_count: 1,
      entries_per_page: 1,
      total_entries: 1,
      total_pages: 1,
      matching_count: 1,
      filter_count: {},
    };
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
