import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { Email, EmailType } from "src/base_modules/email/email.entity";
import { Invitation } from "src/base_modules/organizations/invitations/invitation.entity";
import { invitationExpiry } from "src/base_modules/organizations/invitations/invitation.lifetime";
import { InviteCreateBody } from "src/base_modules/organizations/invitations/orgInvitation.types";
import { ActionType } from "src/base_modules/organizations/log/orgAuditLog.types";
import { OrganizationMemberships } from "src/base_modules/organizations/memberships/organization.memberships.entity";
import {
  getTextualRepOfMemberRole,
  isMemberRoleLessThan,
  MemberRole,
} from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  OrganizationCreateBody,
  OrganizationInfoForInvitee,
  OrganizationSettingsUpdateBody,
} from "src/base_modules/organizations/org.types";
import { Organization } from "src/base_modules/organizations/organization.entity";
import {
  InvitationsRepository,
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import { TeamMember } from "src/base_modules/users/teamMember.types";
import {
  CannotRevokeOwnMembership,
  EntityNotFound,
  FailedToSendOrganizationInviteEmail,
  InvitationInvalidOrExpired,
  NotAMember,
  NotAuthorized,
  PersonalOrgCannotBeModified,
} from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
  TypedPaginatedData,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";
import { genRandomString, hash } from "src/utils/crypto";

import { EmailRepository } from "../email/email.repository";
import { EmailService } from "../email/email.service";
import { ProjectRowsService } from "../projects/project-rows.service";

import { OrganizationLoggerService } from "./log/organizationLogger.service";
import { OrganizationTeardown } from "./organization-teardown";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly emailService: EmailService,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly emailRepository: EmailRepository,
    private readonly invitationsRepository: InvitationsRepository,
    private readonly organizationLoggerService: OrganizationLoggerService,
    private readonly teardown: OrganizationTeardown,
    private readonly projectRows: ProjectRowsService,
  ) {}

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
    user: AuthenticatedUser,
  ): Promise<string> {
    const creator = await this.usersRepository.getUserById(user.userId, {});
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

    organization =
      await this.organizationsRepository.saveOrganization(organization);

    const membership = new OrganizationMemberships();
    membership.role = MemberRole.OWNER;
    membership.joined_on = new Date();
    membership.user = creator;
    membership.organization = organization;
    await this.membershipsRepository.saveMembership(membership);

    await this.organizationLoggerService.addAuditLog(
      ActionType.OrganizationCreated,
      `The User created the organization ${organization.name}.`,
      organization.id,
      user.userId,
    );

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
  async get(orgId: string, user: AuthenticatedUser): Promise<object> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const membership =
      await this.membershipsRepository.getMembershipByOrganizationAndUser(
        orgId,
        user.userId,
        {
          organization: {
            created_by: true,
            organizationMemberships: true,
          },
          user: false,
        },
      );

    const number_of_members =
      await this.membershipsRepository.countMembers(orgId);

    const organizationInfo: object = {
      ...membership.organization,
      role: membership.role,
      joined_on: membership.joined_on,
      number_of_members: number_of_members,
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
  async getOrgMetaData(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<Organization> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    return await this.organizationsRepository.getOrganizationById(orgId, {
      projects: {
        analyses: true,
      },
      integrations: true,
    });
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
    _searchKey?: string,
    _sortBy?: string,
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<OrganizationMemberships>> {
    const { currentPage, entriesPerPage } = pageOf(paginationUserSuppliedConf);
    return this.membershipsRepository.getOrganizationsOfUser(
      user.userId,
      currentPage,
      entriesPerPage,
    );
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
    _searchKey?: string,
    _sortBy?: string,
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<OrganizationMemberships>> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const { currentPage, entriesPerPage } = pageOf(paginationUserSuppliedConf);
    return this.membershipsRepository.getMembersPage(
      orgId,
      currentPage,
      entriesPerPage,
    );
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
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.OWNER,
    );

    const invitedUser = await this.usersRepository.getUserByEmail(
      inviteBody.user_email,
    );

    const inviter = await this.usersRepository.getUserById(user.userId, {});

    const org = await this.organizationsRepository.getOrganizationById(orgId);

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
    invitation.ttl = invitationExpiry();
    await this.invitationsRepository.saveInvitation(invitation);

    const mail = new Email();
    mail.email_type = EmailType.ORGANIZATION_INVITE;
    mail.token_digest = activationTokenhash;
    mail.user_id_digest = userEmailHash;
    mail.ttl = invitation.ttl;
    mail.user = invitedUser;

    await this.emailRepository.saveMail(mail);

    await this.emailService.sendOrganizationInvite({
      email: invitedUser.email,
      inviteToken: activationTokenhash,
      blockOrgInvitesToken: "",
      blockAllOrgInvitesToken: "",
      userEmailDigest: userEmailHash,
      organizationName: org.name,
      inviter: inviter,
      orgId: org.id,
    });

    await this.organizationLoggerService.addAuditLog(
      ActionType.OrganizationMemberInvited,
      `The User invited ${invitedUser.email} to join the organization as ${getTextualRepOfMemberRole(inviteBody.role)}.`,
      orgId,
      user.userId,
    );
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
    user: AuthenticatedUser,
  ): Promise<void> {
    // Same role as sending an invitation.
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.OWNER,
    );

    const org = await this.organizationsRepository.getOrganizationById(orgId);
    if (org.personal) {
      throw new PersonalOrgCannotBeModified();
    }

    const invitation = await this.invitationsRepository.getInvitationBy(
      { id: inviteId, organization: { id: orgId } },
      { user: true },
    );
    const inviter = await this.usersRepository.getUserById(user.userId, {});

    // A new token voids the old link; the expiry restarts in full.
    const previousToken = invitation.token_digest;
    const newToken = await hash(await genRandomString(64), {});
    invitation.token_digest = newToken;
    invitation.ttl = invitationExpiry();
    await this.invitationsRepository.saveInvitation(invitation);

    const mail =
      (await this.emailRepository.findInviteMail(
        previousToken,
        invitation.user_email_digest,
      )) ?? new Email();
    mail.email_type = EmailType.ORGANIZATION_INVITE;
    mail.token_digest = newToken;
    mail.user_id_digest = invitation.user_email_digest;
    mail.ttl = invitation.ttl;
    mail.user = invitation.user;
    await this.emailRepository.saveMail(mail);

    try {
      await this.emailService.sendOrganizationInvite({
        email: invitation.user.email,
        inviteToken: newToken,
        blockOrgInvitesToken: "",
        blockAllOrgInvitesToken: "",
        userEmailDigest: invitation.user_email_digest,
        organizationName: org.name,
        inviter: inviter,
        orgId: org.id,
      });
    } catch (err) {
      throw new FailedToSendOrganizationInviteEmail(err);
    }
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
    user: AuthenticatedUser,
  ): Promise<void> {
    // Same role as sending an invitation.
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.OWNER,
    );

    const org = await this.organizationsRepository.getOrganizationById(orgId);
    if (org.personal) {
      throw new PersonalOrgCannotBeModified();
    }

    const invitation = await this.invitationsRepository.getInvitationBy(
      { id: invitationId, organization: { id: orgId } },
      { user: true },
    );
    await this.invitationsRepository.deleteInvitation(invitation.id);

    await this.organizationLoggerService.addAuditLog(
      ActionType.OrganizationInvitationRevoked,
      `The User revoked the invitation of ${invitation.user.email} to join the organization.`,
      orgId,
      user.userId,
    );
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
    _paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
    _searchKey?: string,
    _sortBy?: string,
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<Invitation>> {
    // const organizations = await CodeclarityDB.getRepository(Organization).find({
    //     where: {
    //         invited: {
    //             id: user.userId
    //         }
    //     }
    // });

    const invitations =
      await this.invitationsRepository.getInvitationsByOrganizationAndUser(
        orgId,
        user.userId,
      );

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
      filter_count: {},
    };
  }

  /**
   * Join an organization via an invitation
   * @throws {EntityNotFound} If no invitation of this organization matches
   * @throws {InvitationInvalidOrExpired} If the invitation has expired
   * @throws {NotAuthorized} If the signed-in user is not the invitee
   *
   * @param orgId The organization id from the join link
   * @param inviteToken The invitation token
   * @param emailDigest The user's email digest
   * @param user The authenticated user
   */
  async joinOrg(
    orgId: string,
    inviteToken: string,
    emailDigest: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const invitation = await this.validInvitation(
      orgId,
      inviteToken,
      emailDigest,
      user,
    );

    const membership = new OrganizationMemberships();
    membership.joined_on = new Date();
    membership.organization = invitation.organization;
    membership.role = invitation.role;
    membership.user = invitation.user;

    await this.membershipsRepository.saveMembership(membership);
    await this.invitationsRepository.deleteInvitation(invitation.id);

    const mail = await this.emailRepository.getActivationMail(
      inviteToken,
      emailDigest,
    );
    await this.emailRepository.deleteMail(mail.id);

    await this.organizationLoggerService.addAuditLog(
      ActionType.OrganizationMemberJoined,
      `The User ${invitation.user.email} joined the organization as ${getTextualRepOfMemberRole(invitation.role)}.`,
      invitation.organization.id,
      user.userId,
    );
  }

  /**
   * Get the organization an invitation is for, as seen by the invitee
   * @throws {EntityNotFound} If no invitation of this organization matches
   * @throws {InvitationInvalidOrExpired} If the invitation has expired
   * @throws {NotAuthorized} If the signed-in user is not the invitee
   *
   * @param orgId The organization id from the join link
   * @param inviteToken The invitation token
   * @param emailDigest The user's email digest
   * @param user The authenticated user
   */
  async getInviteeInfo(
    orgId: string,
    inviteToken: string,
    emailDigest: string,
    user: AuthenticatedUser,
  ): Promise<OrganizationInfoForInvitee> {
    const info = new OrganizationInfoForInvitee();
    const invitation = await this.validInvitation(
      orgId,
      inviteToken,
      emailDigest,
      user,
    );

    info.id = invitation.id;
    info.name = invitation.organization.name;
    info.description = invitation.organization.description;
    info.color_scheme = invitation.organization.color_scheme;
    info.created_by = invitation.organization.created_by;
    info.created_on = invitation.organization.created_on;
    info.number_of_members =
      invitation.organization.organizationMemberships.length;
    info.invite_created_by = invitation.organization.created_by; // TODO Change this line
    info.invite_created_on = invitation.created_on;
    info.role = invitation.role;

    return info;
  }

  /**
   * Finds an invitation the signed-in user may accept now.
   * @throws {EntityNotFound} If no invitation of this organization matches
   * @throws {InvitationInvalidOrExpired} If the invitation has expired
   * @throws {NotAuthorized} If the signed-in user is not the invitee
   */
  private async validInvitation(
    orgId: string,
    inviteToken: string,
    emailDigest: string,
    user: AuthenticatedUser,
  ): Promise<Invitation> {
    const invitation = await this.invitationsRepository.getInvitationBy(
      {
        token_digest: inviteToken,
        user_email_digest: emailDigest,
        organization: { id: orgId },
      },
      {
        organization: {
          organizationMemberships: true,
          created_by: true,
        },
        user: true,
      },
    );
    // A missing ttl counts as expired.
    if (!invitation.ttl || invitation.ttl.getTime() <= Date.now()) {
      throw new InvitationInvalidOrExpired();
    }
    if (invitation.user.id !== user.userId) {
      throw new NotAuthorized();
    }
    return invitation;
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
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );
    if (user_id_to_remove === user.userId) {
      throw new CannotRevokeOwnMembership();
    }

    const org = await this.organizationsRepository.getOrganizationById(orgId);
    if (org.personal) {
      throw new PersonalOrgCannotBeModified();
    }

    let membership: OrganizationMemberships;
    try {
      membership =
        await this.membershipsRepository.getMembershipByOrganizationAndUser(
          orgId,
          user_id_to_remove,
          { user: true },
        );
    } catch (err) {
      if (err instanceof EntityNotFound) {
        throw new NotAMember();
      }
      throw err;
    }

    // An admin cannot remove someone with a higher role, such as an owner.
    const actor = await this.membershipsRepository.getMembershipRole(
      orgId,
      user.userId,
    );
    if (isMemberRoleLessThan(actor.role, membership.role)) {
      throw new NotAuthorized();
    }

    await this.membershipsRepository.removeMemberships([membership]);

    await this.organizationLoggerService.addAuditLog(
      ActionType.OrganizationMembershipRevoked,
      `The User revoked the membership of ${membership.user.email}.`,
      orgId,
      user.userId,
    );
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
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const leaver = await this.usersRepository.getUserById(user.userId, {});

    await this.membershipsRepository.leaveOrganization(user.userId, orgId);

    await this.organizationLoggerService.addAuditLog(
      ActionType.OrganizationUserLeft,
      `The User ${leaver.email} left the organization.`,
      orgId,
      user.userId,
    );
  }

  /**
   * Delete an organization with everything it owns; only an owner may
   * @throws {NotAuthorized}
   * @throws {PersonalOrgCannotBeModified} A user cannot delete a personal organization
   * @throws {EntityNotFound} In case the organization no longer exists
   *
   * @param orgId The id of the organization
   * @param user The authenticated user
   */
  async deleteOrg(orgId: string, user: AuthenticatedUser): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.OWNER,
    );
    const org = await this.organizationsRepository.getOrganizationById(orgId);
    if (org.personal) {
      throw new PersonalOrgCannotBeModified();
    }

    const memberships =
      await this.membershipsRepository.getMembershipsByOrganizationId(orgId);
    // All or nothing: a failed delete keeps every row and membership.
    const projectIds = await this.organizationsRepository.runInTransaction(
      async (manager) => {
        const deleted = await this.teardown.deleteContents(orgId, manager);
        await this.membershipsRepository.removeMemberships(
          memberships,
          manager,
        );
        await this.organizationsRepository.deleteOrganization(orgId, manager);
        return deleted;
      },
    );
    await this.projectRows.removeFolders(orgId, projectIds);
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
    _orgId: string,
    _userId: string,
    _user: AuthenticatedUser,
  ): Promise<TeamMember> {
    throw new Error("Method not implemented.");
  }

  /**
   * Update organization settings
   * @throws {NotAuthorized} If the user is not an admin or owner
   * @throws {EntityNotFound} If the organization does not exist
   *
   * @param orgId The id of the organization
   * @param settingsBody The settings to update
   * @param user The authenticated user
   */
  async updateSettings(
    orgId: string,
    settingsBody: OrganizationSettingsUpdateBody,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );

    const organization =
      await this.organizationsRepository.getOrganizationById(orgId);

    if (settingsBody.auto_resolve_tickets !== undefined) {
      organization.auto_resolve_tickets = settingsBody.auto_resolve_tickets;
    }

    await this.organizationsRepository.saveOrganization(organization);
  }
}

/** Turns the requested page into a safe page index and size. */
function pageOf(conf: PaginationUserSuppliedConf): {
  currentPage: number;
  entriesPerPage: number;
} {
  const config: PaginationConfig = {
    maxEntriesPerPage: 100,
    defaultEntriesPerPage: 50,
  };
  const entriesPerPage = conf.entriesPerPage
    ? Math.min(config.maxEntriesPerPage, Math.max(1, conf.entriesPerPage))
    : config.defaultEntriesPerPage;
  const currentPage = Math.max(0, conf.currentPage ?? 0);
  return { currentPage, entriesPerPage };
}
