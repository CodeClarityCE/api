import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/types/auth/types';
import { EntityNotFound, UserDoesNotExist } from 'src/types/errors/types';
import { TypedPaginatedData } from 'src/types/paginated/types';
import { PaginationUserSuppliedConf } from 'src/types/paginated/types';
import { SortDirection } from 'src/types/sort/types';
import { TeamMember } from 'src/types/entities/frontend/TeamMember';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { InviteCreateBody } from 'src/types/entities/frontend/OrgInvitation';
import {
    OrganizationCreateBody,
    OrganizationInfoForInvitee
} from 'src/types/entities/frontend/Org';
import { OrganizationMemberships } from 'src/base_modules/organizations/organization.memberships.entity';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { Email, EmailType } from 'src/base_modules/email/email.entity';
import { Invitation } from 'src/base_modules/organizations/invitation.entity';
import { genRandomString } from 'src/utils/crypto';
import { hash } from 'src/utils/crypto';
import { EmailService } from '../email/email.service';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from './organizations.repository';
import { EmailRepository } from '../email/email.repository';
import { InvitationsRepository } from './invitations.repository';

@Injectable()
export class OrganizationsService {
    constructor(
        private readonly emailService: EmailService,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly usersRepository: UsersRepository,
        private readonly emailRepository: EmailRepository,
        private readonly invitationsRepository: InvitationsRepository
    ) { }

    /**
     * Creates an organization
     * @throws {InternalError}
     *
     * @param organizationData The organization data
     * @param user The authenticated user
     * @returns the id of the created organization
     */
    async create(
        organizationData: OrganizationCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        const creator = await this.usersRepository.getUserById(user.userId, {})
        if (!creator) {
            throw new EntityNotFound();
        }

        let organization = new Organization();
        organization.name = organizationData.name;
        organization.description = organizationData.description;
        organization.color_scheme = organizationData.color_scheme;
        organization.personal = false;
        organization.created_on = new Date();
        organization.created_by = creator;

        organization = await this.organizationsRepository.saveOrganization(organization);

        let membership = new OrganizationMemberships();
        membership.role = MemberRole.OWNER;
        membership.joined_on = new Date();
        membership.user = creator;
        membership.organization = organization;
        membership = await this.organizationsRepository.saveMembership(membership);

        return organization.id;
    }

    /**
     * Get an organization
     * @throws {NotAuthorized} If the user does not have access to the org
     * @throws {EntityNotFound} If the org cannot be found
     *
     * @param orgId The id of the organization
     * @param user The authenticated user
     * @returns the organization information
     */
    async get(orgId: string, user: AuthenticatedUser): Promise<Object> {
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);
        const membership = await this.organizationsRepository.getMembershipByOrganizationAndUser(
            orgId, user.userId, {
            organization: true,
            user: false
        }
        )

        const number_of_members = await this.organizationsRepository.countMembers(orgId)

        const organizationInfo: Object = {
            ...membership.organization,
            role: membership.role,
            joined_on: membership.joined_on,
            number_of_members: number_of_members
        };
        return organizationInfo;
    }

    /**
     * Get org metadata
     * @throws {NotAuthorized} If the user does not have access to the org
     * @throws {EntityNotFound} If the org cannot be found
     *
     * @param orgId The id of the organization
     * @param user The authenticated user
     * @returns the organization metadata information
     */
    async getOrgMetaData(orgId: string, user: AuthenticatedUser): Promise<Organization> {
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        return await this.organizationsRepository.getOrganizationById(orgId, {
            projects: {
                analyses: true
            },
            integrations: true
        })
    }

    /**
     * Get orgs where user is part of
     * @param paginationUserSuppliedConf Paginiation configuration
     * @param user The authenticatéd user
     * @param searchKey A search key to filter the records by
     * @param sortBy A sort field to sort the records by
     * @param sortDirection A sort direction
     * @returns the orgs
     */
    async getMany(
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser,
        searchKey?: string,
        sortBy?: string,
        sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<Object>> {
        return this.organizationsRepository.getOrganizationsOfUser(user.userId)
    }

    /**
     * Get members of an org
     * @throws {NotAuthorized}
     *
     * @param orgId The id of the organization
     * @param paginationUserSuppliedConf The pagination config
     * @param user The authenticated user
     * @param searchKey A search key to filter the records by
     * @param sortBy A sort field to sort the records by
     * @param sortDirection A sort direction
     * @returns the organzation members
     */
    async getOrgMembers(
        orgId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser,
        searchKey?: string,
        sortBy?: string,
        sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<TeamMember>> {
        throw new Error('Method not implemented.');
    }

    /**
     * Invite a user to an organization
     * @throws {NotAuthorized}
     * @throws {EntityNotFound}
     * @throws {PersonalOrgCannotBeModified}
     * @throws {InvitationOrgAlreadyExists}
     * @throws {AlreadyExists}
     * @throws {UserDoesNotExist}
     * @throws {InternalError}
     *
     * @param orgId The organization id
     * @param inviteBody The invitation
     * @param user The authenticated user
     */
    async inviteMember(
        orgId: string,
        inviteBody: InviteCreateBody,
        user: AuthenticatedUser
    ): Promise<void> {
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.OWNER);

        const invitedUser = await this.usersRepository.getUserByEmail(inviteBody.user_email)

        if (!invitedUser) {
            throw new UserDoesNotExist();
        }

        const inviter = await this.usersRepository.getUserById(user.userId, {})

        const org = await this.organizationsRepository.getOrganizationById(orgId)

        const activationToken = await genRandomString(64);
        const activationTokenhash = await hash(activationToken, {});
        const userEmailHash = await hash(invitedUser.email, {});

        const invitation: Invitation = new Invitation();
        invitation.created_on = new Date();
        invitation.role = inviteBody.role;
        invitation.token_digest = activationTokenhash;
        invitation.user_email_digest = userEmailHash;
        invitation.user = invitedUser;
        invitation.organization = org;
        invitation.ttl = new Date(new Date().getTime() + 30 * 60000);
        await this.invitationsRepository.saveInvitation(invitation);

        const mail = new Email();
        mail.email_type = EmailType.ORGANIZATION_INVITE;
        mail.token_digest = activationTokenhash;
        mail.user_id_digest = userEmailHash;
        mail.ttl = new Date(new Date().getTime() + 30 * 60000); // Expires after 30 mins
        mail.user = invitedUser;

        await this.emailRepository.saveMail(mail);

        await this.emailService.sendOrganizationInvite({
            email: invitedUser.email,
            inviteToken: activationTokenhash,
            blockOrgInvitesToken: '',
            blockAllOrgInvitesToken: '',
            userEmailDigest: userEmailHash,
            organizationName: org.name,
            inviter: inviter,
            orgId: org.id
        });
    }

    /**
     * Resend an organization invite email
     * @throws {NotAuthorized}
     * @throws {EntityNotFound}
     * @throws {PersonalOrgCannotBeModified}
     * @throws {AlreadyExists}
     * @throws {FailedToSendOrganizationInviteEmail}
     *
     * @param orgId The id of the organizaiton
     * @param inviteId The id of the invitee
     * @param user The authenticated user
     */
    async reSendOrganizationInviteEmail(
        orgId: string,
        inviteId: string,
        user: AuthenticatedUser
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Revoke an open org-join invitation
     * @throws {NotAuthorized}
     * @throws {PersonalOrgCannotBeModified}
     *
     * @param orgId The id of the organization
     * @param invitationId The id of the invitation
     * @param user The authenticated user
     */
    async revokeInvitation(
        orgId: string,
        invitationId: string,
        user: AuthenticatedUser
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Get the org's join-org invitations
     * @throws {NotAuthorized}
     * @throws {EntityNotFound}
     *
     * @param orgId The id of the organization
     * @param paginationUserSuppliedConf The pagination config
     * @param user The authenticated user
     * @returns the org's join-org invitations
     */
    async getInvitations(
        orgId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser,
        searchKey?: string,
        sortBy?: string,
        sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<Invitation>> {
        // const organizations = await CodeclarityDB.getRepository(Organization).find({
        //     where: {
        //         invited: {
        //             id: user.userId
        //         }
        //     }
        // });

        const invitations = await this.invitationsRepository.getInvitationsByOrganizationAndUser(orgId, user.userId)

        // for (const org of organizations) {
        //     const invitation = new Invitation();
        //     invitation.

        // }

        return {
            data: invitations,
            page: 0,
            entry_count: 0,
            entries_per_page: 0,
            total_entries: 0,
            total_pages: 0,
            matching_count: 0,
            filter_count: {}
        };
    }

    /**
     * Join an organization via an invitation
     * @throws {InvitationInvalidOrExpired}
     * @throws {InternalError}
     *
     * @param inviteToken The invitation token
     * @param emailDigest The user's email digest
     * @param user The authenticated user
     */
    async joinOrg(
        inviteToken: string,
        emailDigest: string,
        user: AuthenticatedUser
    ): Promise<void> {
        const invitation = await this.invitationsRepository.getInvitationBy(
            {
                token_digest: inviteToken,
                user_email_digest: emailDigest
            },
            {
                organization: {
                    organizationMemberships: true,
                    created_by: true
                },
                user: true
            }
        )

        const membership = new OrganizationMemberships();
        membership.joined_on = new Date();
        membership.organization = invitation.organization;
        membership.role = invitation.role;
        membership.user = invitation.user;

        await this.organizationsRepository.saveMembership(membership);
        await this.invitationsRepository.deleteInvitation(invitation);

        const mail = await this.emailRepository.getActivationMail(inviteToken, emailDigest)
        await this.emailRepository.deleteMail(mail);
    }

    /**
     * Join an organization via an invitation
     * @throws {InvitationInvalidOrExpired}
     * @throws {InternalError}
     *
     * @param inviteToken The invitation token
     * @param emailDigest The user's email digest
     * @param user The authenticated user
     */
    async getInviteeInfo(
        inviteToken: string,
        emailDigest: string,
        user: AuthenticatedUser
    ): Promise<OrganizationInfoForInvitee> {
        const invitee = await this.usersRepository.getUserById(user.userId, {})
        if (!invitee) {
            throw new EntityNotFound();
        }

        const info = new OrganizationInfoForInvitee();
        const invitation = await this.invitationsRepository.getInvitationBy(
            {
                token_digest: inviteToken,
                user_email_digest: emailDigest,
                user: invitee
            },
            {
                organization: {
                    organizationMemberships: true,
                    created_by: true
                },
                user: true
            }
        )

        info.id = invitation.id;
        info.name = invitation.organization.name;
        info.description = invitation.organization.description;
        info.color_scheme = invitation.organization.color_scheme;
        info.created_by = invitation.organization.created_by;
        info.created_on = invitation.organization.created_on;
        info.number_of_members = invitation.organization.organizationMemberships.length;
        info.invite_created_by = invitation.organization.created_by; // TODO Change this line
        info.invite_created_on = invitation.created_on;
        info.role = invitation.role;

        return info;
    }

    /**
     * Revoke an organization membership
     * @throws {NotAuthorized}
     * @throws {EntityNotFound}
     * @throws {PersonalOrgCannotBeModified}
     * @throws {CannotRevokeOwnMembership}
     * @throws {NotAMember}
     *
     * @param orgId The id of the organization
     * @param user_id_to_remove The id of the user to remove
     * @param user The authenticated user
     */
    async revokeOrgMemberShip(
        orgId: string,
        user_id_to_remove: string,
        user: AuthenticatedUser
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Leave an organization
     * @throws {NotAuthorized}
     * @throws {PersonalOrgCannotBeModified} A user cannot leave a personal organization
     * @throws {CannotLeaveAsLastOwner} A user cannot leave as the owner of an org. Instead they must delete the org instead.
     * @throws {EntityNotFound} In case the organization no longer exists
     *
     * @param orgId The id of the organization
     * @param user The authenticated user
     */
    async leaveOrg(orgId: string, user: AuthenticatedUser): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Delete an organization
     * @throws {NotAuthorized}
     * @throws {PersonalOrgCannotBeModified} A user cannot delete a personal organization
     * @throws {EntityNotFound} In case the organization no longer exists
     *
     * @param orgId The id of the organization
     * @param user The authenticated user
     */
    async deleteOrg(orgId: string, user: AuthenticatedUser): Promise<void> {
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const memberships = await this.organizationsRepository.getMembershipsByOrganizationId(orgId)
        await this.organizationsRepository.removeMemberships(memberships);
        await this.organizationsRepository.deleteOrganization(orgId)
    }

    /**
     * Get a member of an org
     * @throws {NotAuthorized}
     * @throws {EntityNotFound}
     *
     * @param orgId The id of the organization
     * @param userId The id of the user
     * @param user The authenticated user
     * @returns the team member
     */
    public async getOrgMember(
        orgId: string,
        userId: string,
        user: AuthenticatedUser
    ): Promise<TeamMember> {
        throw new Error('Method not implemented.');
    }
}

