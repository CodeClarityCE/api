import { Injectable } from '@nestjs/common';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Entity, Repository } from 'typeorm';
import { MemberRole, OrganizationMemberships } from 'src/base_modules/organizations/organization.memberships.entity';
import { EntityNotFound, NotAuthorized } from 'src/types/error.types';
import { isMemberRoleLessThan, OrgMembership } from 'src/base_modules/organizations/orgMembership.types';
import { TypedPaginatedData } from 'src/types/pagination.types';
import { User } from '../users/users.entity';

/**
 * Injectable service for handling organizations and their memberships.
 */
@Injectable()
export class OrganizationsRepository {
    /**
     * Constructor to initialize the organization and membership repositories.
     *
     * @param organizationRepository - Repository for managing organizations.
     * @param membershipRepository - Repository for managing organization memberships.
     */
    constructor(
        @InjectRepository(Organization, 'codeclarity')
        private organizationRepository: Repository<Organization>,
        @InjectRepository(OrganizationMemberships, 'codeclarity')
        private membershipRepository: Repository<OrganizationMemberships>,
    ) {}
    /**
     * Retrieve an organization by its ID.
     *
     * @param orgId - The ID of the organization to retrieve.
     * @param relations - Optional object specifying related entities to include.
     * @returns The organization entity if found.
     * @throws {EntityNotFound} If no organization with the given ID exists.
     */
    async getOrganizationById(orgId: string, relations?: object): Promise<Organization> {
        const organization = await this.organizationRepository.findOne({
            where: { id: orgId },
            relations: relations,
        });

        if (!organization) {
            throw new EntityNotFound();
        }

        return organization;
    }
    
    /**
     * Retrieve the membership role of a user in a specific organization.
     *
     * @param orgId - The ID of the organization.
     * @param userId - The ID of the user.
     * @returns The organization memberships entity if found, containing the role and ID.
     * @throws {EntityNotFound} If no membership exists for the given user in the organization.
     */
    async getMembershipsByOrganizationId(organizationId: string): Promise<OrganizationMemberships[]> {
        const memberships = await this.membershipRepository.find({
            where: {
                organization: {
                    id: organizationId
                }
            }
        });

        if (!memberships) {
            throw new EntityNotFound();
        }

        return memberships;
    }

    /**
     * Deletes an organization by its ID.
     *
     * @param organizationId - The ID of the organization to delete.
     */
    async deleteOrganization(organizationId: string): Promise<void> {
        await this.organizationRepository.delete(organizationId);
    }

    /**
     * Removes multiple memberships from the database.
     *
     * @param memberships - An array of OrganizationMemberships entities to remove.
     */
    async removeMemberships(memberships: OrganizationMemberships[]): Promise<void> {
        await this.membershipRepository.remove(memberships);
    }
    
    /**
     * Retrieve the membership role of a user in a specific organization.
     *
     * @param orgId - The ID of the organization.
     * @param userId - The ID of the user.
     * @returns The organization memberships entity if found, containing the role and ID.
     * @throws {EntityNotFound} If no membership exists for the given user in the organization.
     */
    async getMembershipRole(orgId: string, userId: string): Promise<OrganizationMemberships> {
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
     *
     * @param organizationId - The ID of the organization.
     * @param userId - The ID of the user.
     * @param requiredRole - The minimum required role for the user.
     * @throws {NotAuthorized} If the user does not have the required role or is not a member.
     */
    async hasRequiredRole(organizationId: string, userId: string, requiredRole: MemberRole): Promise<void> {
        try {
            const memberRole = (await this.getMembershipRole(organizationId, userId)).role;

            if (isMemberRoleLessThan(memberRole, requiredRole)) {
                throw new NotAuthorized();
            }
        } catch (err) {
            if (err instanceof EntityNotFound) {
                throw new NotAuthorized();
            }
        }
    }

    /**
     * Save an organization entity to the database.
     *
     * @param organization - The organization entity to save.
     * @returns The saved organization entity.
     */
    async saveOrganization(organization: Organization): Promise<Organization> {
        return this.organizationRepository.save(organization);
    }

    /**
     * Save an organization membership entity to the database.
     *
     * @param membership - The organization memberships entity to save.
     * @returns The saved organization memberships entity.
     */
    async saveMembership(membership: OrganizationMemberships): Promise<OrganizationMemberships> {
        return this.membershipRepository.save(membership);
    }

    /**
     * Check if an integration belongs to a specific organization.
     *
     * @param integrationId - The ID of the integration.
     * @param orgId - The ID of the organization.
     * @returns A boolean indicating whether the integration belongs to the organization.
     */
    async doesIntegrationBelongToOrg(integrationId: string, orgId: string): Promise<boolean> {
        const exists = await this.organizationRepository.exists({
            relations: { integrations: true },
            where: {
                id: orgId,
                integrations: { id: integrationId },
            },
        });

        return exists;
    }

    async getMembershipByOrganizationAndUser(organizationId: string, userId: string, relations?: object): Promise<OrganizationMemberships> {
        const membership = await this.membershipRepository.findOne({
            where: {
                organization: {
                    id: organizationId
                },
                user: {
                    id: userId
                }
            },
            relations: relations
        });

        if (!membership) {
            throw new EntityNotFound()
        }
        return membership
    }

    async getOrganizationsOfUser(userId: string):Promise<TypedPaginatedData<Object>> {
    const memberships = await this.membershipRepository.find({
            where: {
                user: {
                    id: userId
                }
            },
            relations: {
                organization: {
                    owners: true
                },
                user: true
            }
        });

        const res = await this.membershipRepository
            .createQueryBuilder('membership')
            .leftJoinAndSelect(
                Organization,
                'organization',
                'organization.id = membership.organization.id'
            )
            .leftJoinAndSelect(User, 'user', 'user.id = membership.user')
            .where('user.id = :userId', { userId: userId })
            .getMany();

        return {
            data: memberships,
            page: 1,
            entry_count: 1,
            entries_per_page: 1,
            total_entries: 1,
            total_pages: 1,
            matching_count: 1,
            filter_count: {}
        };
    }

    async countMembers(organizationId: string): Promise<number> {
        return this.membershipRepository.count({
            where: {
                organization: {
                    id: organizationId
                }
            }
        });
    }
    
}
