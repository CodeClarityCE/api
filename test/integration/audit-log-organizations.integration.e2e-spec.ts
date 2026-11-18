import { Email } from "../../src/base_modules/email/email.entity";
import { EmailService } from "../../src/base_modules/email/email.service";
import { Invitation } from "../../src/base_modules/organizations/invitations/invitation.entity";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { auditEntries, readAuditLog } from "../utils/audit-log";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Audit log of organization actions (e2e)", () => {
  let owner: TestUser;
  let member: TestUser;
  let invitee: TestUser;
  let sentInvites: { inviteToken: string; userEmailDigest: string }[];

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@orgaudit.com",
      orgName: "Audit Org",
      role: MemberRole.OWNER,
    });
    member = await testHelper.createTestUser({
      email: "member@orgaudit.com",
      organization: owner.organization,
      role: MemberRole.USER,
    });
    invitee = await testHelper.createTestUser({
      email: "invitee@orgaudit.com",
      orgName: "Invitee Org",
    });
    // Capture invite emails instead of sending them; they carry the join link.
    sentInvites = [];
    jest
      .spyOn(testHelper.getApp().get(EmailService), "sendOrganizationInvite")
      .mockImplementation(async (invite) => {
        sentInvites.push(invite);
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function inviteInvitee(by: TestUser = owner): Promise<any> {
    return request(by, "POST", `/org/${owner.organization.id}/create_invite`, {
      user_email: "invitee@orgaudit.com",
      role: MemberRole.ADMIN,
    });
  }

  function request(
    user: TestUser,
    method: "GET" | "POST" | "DELETE",
    url: string,
    body?: object,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      method,
      url,
      user.accessToken,
      body,
    );
  }

  // Someone follows the join link from the captured invite email.
  function join(
    token: string,
    emailDigest: string,
    as: TestUser = invitee,
    orgId: string = owner.organization.id,
  ): Promise<any> {
    return request(as, "POST", `/org/${orgId}/join`, {
      token,
      email_digest: emailDigest,
    });
  }

  function invitationRow(token: string): Promise<Invitation | null> {
    return testHelper
      .getDataSource()
      .getRepository(Invitation)
      .findOneBy({ token_digest: token });
  }

  // The invitee's membership in the inviting organization, if any.
  function inviteeMembership(): Promise<OrganizationMemberships | null> {
    return testHelper
      .getDataSource()
      .getRepository(OrganizationMemberships)
      .findOneBy({
        user: { id: invitee.user.id },
        organization: { id: owner.organization.id },
      });
  }

  // Raw SQL, since the entity types ttl as never null.
  async function setInvitationTtl(
    token: string,
    ttl: Date | null,
  ): Promise<void> {
    await testHelper
      .getDataSource()
      .query("UPDATE invitation SET ttl = $1 WHERE token_digest = $2", [
        ttl,
        token,
      ]);
  }

  // Nothing changed: the invitation stays and nobody joined.
  async function expectRefusedJoin(token: string): Promise<void> {
    expect(await invitationRow(token)).not.toBeNull();
    expect(await inviteeMembership()).toBeNull();
    expect(await auditEntries(owner, "OrganizationMemberJoined")).toEqual([]);
  }

  describe("creating an organization", () => {
    it("records who created it and its name", async () => {
      const response = await request(owner, "POST", "/org", {
        name: "Fresh Org",
        description: "A new organization",
        color_scheme: "1",
      });

      expect(response.statusCode).toBe(201);
      const entries = await readAuditLog(owner, response.json().id);
      expect(entries.filter((e) => e.action === "OrganizationCreated")).toEqual(
        [
          expect.objectContaining({
            action_class: "Organization",
            action_severity: 3,
            blame_on_email: "owner@orgaudit.com",
            description: expect.stringContaining("Fresh Org"),
          }),
        ],
      );
    });

    it("writes nothing when the request is invalid", async () => {
      const response = await request(owner, "POST", "/org", {
        name: "",
        description: "A new organization",
        color_scheme: "1",
      });

      expect(response.statusCode).toBe(400);
      const orgs = await request(owner, "GET", "/org");
      expect(orgs.json().total_entries).toBe(1);
      expect(await auditEntries(owner, "OrganizationCreated")).toEqual([]);
    });
  });

  describe("inviting a member", () => {
    it("records who invited whom", async () => {
      const response = await inviteInvitee();

      expect(response.statusCode).toBe(201);
      expect(await auditEntries(owner, "OrganizationMemberInvited")).toEqual([
        expect.objectContaining({
          action_class: "Organization",
          action_severity: 2,
          blame_on_email: "owner@orgaudit.com",
          description: expect.stringContaining("invitee@orgaudit.com"),
        }),
      ]);
    });

    it("writes nothing when a member is not allowed to invite", async () => {
      const response = await inviteInvitee(member);

      expect(response.statusCode).toBe(403);
      expect(await auditEntries(owner, "OrganizationMemberInvited")).toEqual(
        [],
      );
    });
  });

  describe("joining an organization", () => {
    it("records who joined", async () => {
      await inviteInvitee();
      const [invite] = sentInvites;

      const response = await join(invite!.inviteToken, invite!.userEmailDigest);

      expect(response.statusCode).toBe(201);
      expect(await auditEntries(owner, "OrganizationMemberJoined")).toEqual([
        expect.objectContaining({
          action_class: "Organization",
          action_severity: 2,
          blame_on_email: "invitee@orgaudit.com",
          description: expect.stringContaining("invitee@orgaudit.com"),
        }),
      ]);
    });

    it("writes nothing when the invitation token is wrong", async () => {
      await inviteInvitee();
      const [invite] = sentInvites;

      const response = await join("not-the-token", invite!.userEmailDigest);

      expect(response.statusCode).toBe(404);
      expect(await auditEntries(owner, "OrganizationMemberJoined")).toEqual([]);
    });

    it("makes the invitee a member with the invited role and removes the invitation", async () => {
      await inviteInvitee();
      const [invite] = sentInvites;

      const response = await join(invite!.inviteToken, invite!.userEmailDigest);

      expect(response.statusCode).toBe(201);
      expect((await inviteeMembership())?.role).toBe(MemberRole.ADMIN);
      expect(await invitationRow(invite!.inviteToken)).toBeNull();
      expect(
        await testHelper
          .getDataSource()
          .getRepository(Email)
          .findOneBy({ token_digest: invite!.inviteToken }),
      ).toBeNull();
    });

    it("refuses an expired invitation with InvitationInvalidOrExpired", async () => {
      await inviteInvitee();
      const [invite] = sentInvites;
      await setInvitationTtl(invite!.inviteToken, new Date(Date.now() - 1000));

      const response = await join(invite!.inviteToken, invite!.userEmailDigest);

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("InvitationInvalidOrExpired");
      await expectRefusedJoin(invite!.inviteToken);
    });

    it("treats an invitation without a ttl as expired", async () => {
      await inviteInvitee();
      const [invite] = sentInvites;
      await setInvitationTtl(invite!.inviteToken, null);

      const response = await join(invite!.inviteToken, invite!.userEmailDigest);

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("InvitationInvalidOrExpired");
      await expectRefusedJoin(invite!.inviteToken);
    });

    it("refuses someone other than the invitee with NotAuthorized", async () => {
      await inviteInvitee();
      const [invite] = sentInvites;

      const response = await join(
        invite!.inviteToken,
        invite!.userEmailDigest,
        member,
      );

      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
      await expectRefusedJoin(invite!.inviteToken);
    });

    it("refuses a link naming another organization with EntityNotFound", async () => {
      await inviteInvitee();
      const [invite] = sentInvites;

      const response = await join(
        invite!.inviteToken,
        invite!.userEmailDigest,
        invitee,
        invitee.organization.id,
      );

      expect(response.statusCode).toBe(404);
      expect(response.json().error_code).toBe("EntityNotFound");
      await expectRefusedJoin(invite!.inviteToken);
    });
  });

  describe("leaving an organization", () => {
    it("records who left", async () => {
      const response = await request(
        member,
        "POST",
        `/org/${owner.organization.id}/leave_org`,
      );

      expect(response.statusCode).toBe(201);
      expect(await auditEntries(owner, "OrganizationUserLeft")).toEqual([
        expect.objectContaining({
          action_class: "Organization",
          action_severity: 2,
          blame_on_email: "member@orgaudit.com",
          description: expect.stringContaining("member@orgaudit.com"),
        }),
      ]);
    });

    it("writes nothing when someone outside the organization leaves it", async () => {
      const response = await request(
        invitee,
        "POST",
        `/org/${owner.organization.id}/leave_org`,
      );

      expect(response.statusCode).toBe(403);
      expect(await auditEntries(owner, "OrganizationUserLeft")).toEqual([]);
    });
  });

  describe("revoking a membership", () => {
    it("blames the admin who revoked it and names the member", async () => {
      const response = await request(
        owner,
        "DELETE",
        `/org/${owner.organization.id}/members/${member.user.id}`,
      );

      expect(response.statusCode).toBe(200);
      expect(
        await auditEntries(owner, "OrganizationMembershipRevoked"),
      ).toEqual([
        expect.objectContaining({
          action_class: "Organization",
          action_severity: 2,
          blame_on_email: "owner@orgaudit.com",
          description: expect.stringContaining("member@orgaudit.com"),
        }),
      ]);
    });

    it("writes nothing when a member is not allowed to revoke", async () => {
      const response = await request(
        member,
        "DELETE",
        `/org/${owner.organization.id}/members/${owner.user.id}`,
      );

      expect(response.statusCode).toBe(403);
      expect(
        await auditEntries(owner, "OrganizationMembershipRevoked"),
      ).toEqual([]);
    });
  });

  describe("revoking an invitation", () => {
    // Invites the invitee and returns the invitation id from their invitation list.
    async function openInvitation(): Promise<string> {
      await inviteInvitee();
      const list = await request(
        invitee,
        "GET",
        `/org/${owner.organization.id}/invitations`,
      );
      expect(list.statusCode).toBe(200);
      return list.json().data[0].id;
    }

    function revoke(by: TestUser, invitationId: string): Promise<any> {
      return request(
        by,
        "DELETE",
        `/org/${owner.organization.id}/invitations/${invitationId}`,
      );
    }

    it("blames who revoked it and names the invitee", async () => {
      const invitationId = await openInvitation();

      const response = await revoke(owner, invitationId);

      expect(response.statusCode).toBe(200);
      expect(
        await auditEntries(owner, "OrganizationInvitationRevoked"),
      ).toEqual([
        expect.objectContaining({
          action_class: "Organization",
          action_severity: 2,
          blame_on_email: "owner@orgaudit.com",
          description: expect.stringContaining("invitee@orgaudit.com"),
        }),
      ]);
    });

    it("writes nothing when a member is not allowed to revoke", async () => {
      const invitationId = await openInvitation();

      const response = await revoke(member, invitationId);

      expect(response.statusCode).toBe(403);
      expect(
        await auditEntries(owner, "OrganizationInvitationRevoked"),
      ).toEqual([]);
    });

    it("writes nothing when the invitation does not exist", async () => {
      const response = await revoke(owner, crypto.randomUUID());

      expect(response.statusCode).toBe(404);
      expect(
        await auditEntries(owner, "OrganizationInvitationRevoked"),
      ).toEqual([]);
    });
  });
});
