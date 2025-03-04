import { Injectable } from '@nestjs/common';
import { NotAMember, NotAuthorized } from 'src/types/errors/types';
import { MemberRole, isMemberRoleLessThan } from 'src/types/entities/frontend/OrgMembership';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class OrganizationsMemberService {
    constructor(
        @InjectRepository(OrganizationMemberships, 'codeclarity')
        private membershipRepository: Repository<OrganizationMemberships>
    ) {}

    /**
     * Checks whether a given user is a member of a given organization
     * @param organizationId The id of the organization
     * @param userId The id of the user
     * @returns a boolean indicating whether the given user is a member of the given organization
     */
    async isUserMember(organizationId: string, userId: string): Promise<boolean> {
        // return await this.orgMemberRepo.exists(organizationId, userId);
        throw new Error('Method not implemented.');
    }

    /**
     * Checks whether a given user has a given role in a given organization
     * @param organizationId The id of the organization
     * @param userId The id of the user
     * @param role The role to check
     * @returns a boolean indicating whether a given user has a given role in a given organization
     */
    async hasUserMemberRole(
        organizationId: string,
        userId: string,
        role: MemberRole
    ): Promise<boolean> {
        try {
            const userRole = await this.getUserMemberRole(organizationId, userId);
            return userRole == role;
        } catch (err) {
            if (err instanceof NotAMember) {
                return false;
            }
            throw err;
        }
    }

    /**
     * Get the member role of the user in the given organization
     * @throws {NotAMember} Throws an exception in case the user is not a member of the org
     * @param organizationId The id of the organization
     * @param userId The id of the user
     * @returns the member role of the user within the organization
     */
    async getUserMemberRole(organizationId: string, userId: string): Promise<MemberRole> {
        const membership = await this.membershipRepository.findOne({
            where: {
                organization: {
                    id: organizationId
                },
                user: {
                    id: userId
                }
            },
            relations: {
                organization: true,
                user: true
            }
        });

        if (!membership) {
            throw new NotAMember();
        }
        return membership.role;
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
            const memberRole: MemberRole = await this.getUserMemberRole(organizationId, userId);

            if (isMemberRoleLessThan(memberRole, requiredRole)) {
                throw new NotAuthorized();
            }
        } catch (err) {
            if (err instanceof NotAMember) {
                throw new NotAuthorized();
            }
        }
    }
}
