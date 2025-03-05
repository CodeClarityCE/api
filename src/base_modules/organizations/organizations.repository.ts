import { Injectable } from '@nestjs/common';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemberRole, OrganizationMemberships } from 'src/base_modules/organizations/organization.memberships.entity';
import { EntityNotFound, NotAMember, NotAuthorized } from 'src/types/errors/types';
import { isMemberRoleLessThan } from 'src/types/entities/frontend/OrgMembership';

@Injectable()
export class OrganizationsRepository {
    constructor(
        @InjectRepository(Organization, 'codeclarity')
        private organizationRepository: Repository<Organization>,
        @InjectRepository(OrganizationMemberships, 'codeclarity')
        private membershipRepository: Repository<OrganizationMemberships>,
    ) { }

    /**
        * Return the user with the given id.
        * @throws {EntityNotFound} in case no user with the given userId could be found
        *
        * @param orgId userId
        * @returns the user
        */
    async getOrganizationById(orgId: string, relations?: object): Promise<Organization> {
        const user = await this.organizationRepository.findOne({
            where:
                { id: orgId },
            relations: relations
        });

        if (!user) {
            throw new EntityNotFound();
        }

        return user;
    }

    /**
        * Return the user with the given id.
        * @throws {EntityNotFound} in case no user with the given userId could be found
        *
        * @param orgId orgId
        * @param userId userId
        * @returns the user
        */
    async getMembershipRole(orgId: string, userId: string): Promise<OrganizationMemberships> {
        const membership = await this.membershipRepository.findOne({
            relations: {
                organization: true
            },
            where: {
                organization: {
                    id: orgId
                },
                user: {
                    id: userId
                }
            },
            select: {
                role: true,
                organizationMembershipId: true
            }
        });

        if (!membership) {
            throw new EntityNotFound();
        }

        return membership;
    }

     /**
         * Checks if the user's role is equal OR higher than the required role.
         * @throws {NotAuthorized} In the case the the user's role is less than the required one.
         * @param organizationId The id of the organization
         * @param userId The id of the user
         * @param requiredRole The minimum required role
         */
        async hasRequiredRole(
            organizationId: string,
            userId: string,
            requiredRole: MemberRole
        ): Promise<void> {
            try {
                const memberRole: MemberRole = (await this.getMembershipRole(organizationId, userId)).role;
    
                if (isMemberRoleLessThan(memberRole, requiredRole)) {
                    throw new NotAuthorized();
                }
            } catch (err) {
                if (err instanceof NotAMember) {
                    throw new NotAuthorized();
                }
            }
        }

    async saveOrganization(organization: Organization): Promise<Organization> {
        return this.organizationRepository.save(organization)
    }

    async saveMembership(membership: OrganizationMemberships): Promise<OrganizationMemberships> {
        return this.membershipRepository.save(membership)
    }

    /**
        * Checks whether the integration, with the given id, belongs to the organization, with the given id
        * @param integrationId The id of the integration
        * @param orgId The id of the organization
        * @returns whether or not the integration belongs to the org
        */
    async doesIntegrationBelongToOrg(integrationId: string, orgId: string): Promise<boolean> {
        const belongs = await this.organizationRepository.exists({
            relations: {
                integrations: true
            },
            where: {
                id: orgId,
                integrations: {
                    id: integrationId
                }
            }
        });
        return belongs;
    }
}
