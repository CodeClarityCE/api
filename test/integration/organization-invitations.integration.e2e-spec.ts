import { Email } from "../../src/base_modules/email/email.entity";
import { EmailService } from "../../src/base_modules/email/email.service";
import { Invitation } from "../../src/base_modules/organizations/invitations/invitation.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Organization invitations (e2e)", () => {
  let owner: TestUser;
  let invitee: TestUser;
  let outsider: TestUser;
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
      email: "owner@invites.com",
      orgName: "Inviting Org",
      role: MemberRole.OWNER,
    });
    await testHelper.createTestUser({
      email: "member@invites.com",
      organization: owner.organization,
      role: MemberRole.USER,
    });
    invitee = await testHelper.createTestUser({
      email: "invitee@invites.com",
      orgName: "Invitee Org",
    });
    outsider = await testHelper.createTestUser({
      email: "outsider@invites.com",
      orgName: "Outsider Org",
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

  // Owner invites the invitee as an admin and returns the emailed link values.
  async function invite(): Promise<{ token: string; digest: string }> {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${owner.organization.id}/create_invite`,
      owner.accessToken,
      { user_email: "invitee@invites.com", role: MemberRole.ADMIN },
    );
    expect(response.statusCode).toBe(201);
    const [sent] = sentInvites;
    return { token: sent!.inviteToken, digest: sent!.userEmailDigest };
  }

  function inviteeInfo(
    user: TestUser,
    token: string,
    digest: string,
    orgId: string = owner.organization.id,
  ): Promise<any> {
    const query = new URLSearchParams({ token, user_email_hash: digest });
    return testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${orgId}/org_info_invitee?${query.toString()}`,
      user.accessToken,
    );
  }

  // Raw SQL, since the entities type these columns as never null.
  async function clearNullableColumns(token: string): Promise<void> {
    const db = testHelper.getDataSource();
    await db.query(
      "UPDATE invitation SET created_on = NULL WHERE token_digest = $1",
      [token],
    );
    await db.query("UPDATE email SET ttl = NULL WHERE token_digest = $1", [
      token,
    ]);
  }

  function invitationRow(token: string): Promise<Invitation | null> {
    return testHelper
      .getDataSource()
      .getRepository(Invitation)
      .findOneBy({ token_digest: token });
  }

  function emailRow(token: string): Promise<Email | null> {
    return testHelper
      .getDataSource()
      .getRepository(Email)
      .findOneBy({ token_digest: token });
  }

  describe("GET /org/:id/org_info_invitee", () => {
    it("shows the invitee the organization they are invited to", async () => {
      const { token, digest } = await invite();
      const invitation = await testHelper
        .getDataSource()
        .getRepository(Invitation)
        .findOneByOrFail({ token_digest: token });

      const response = await inviteeInfo(invitee, token, digest);

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(
        expect.objectContaining({
          name: "Inviting Org",
          role: MemberRole.ADMIN,
          number_of_members: 2,
          invite_created_on: invitation.created_on.toISOString(),
        }),
      );
    });

    it("answers EntityNotFound for a wrong token", async () => {
      const { digest } = await invite();

      const response = await inviteeInfo(invitee, "not-the-token", digest);

      expect(response.statusCode).toBe(404);
      expect(response.json().error_code).toBe("EntityNotFound");
    });

    it("answers EntityNotFound for a wrong email digest", async () => {
      const { token } = await invite();

      const response = await inviteeInfo(invitee, token, "not-the-digest");

      expect(response.statusCode).toBe(404);
      expect(response.json().error_code).toBe("EntityNotFound");
    });

    it("answers NotAuthorized to a user who is not the invitee", async () => {
      const { token, digest } = await invite();

      const response = await inviteeInfo(outsider, token, digest);

      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });

    it("answers InvitationInvalidOrExpired once the invitation has expired", async () => {
      const { token, digest } = await invite();
      await testHelper
        .getDataSource()
        .getRepository(Invitation)
        .update({ token_digest: token }, { ttl: new Date(Date.now() - 1000) });

      const response = await inviteeInfo(invitee, token, digest);

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("InvitationInvalidOrExpired");
    });

    it("answers EntityNotFound for a link naming another organization", async () => {
      const { token, digest } = await invite();

      const response = await inviteeInfo(
        invitee,
        token,
        digest,
        invitee.organization.id,
      );

      expect(response.statusCode).toBe(404);
      expect(response.json().error_code).toBe("EntityNotFound");
    });

    it.each(["token", "user_email_hash"])(
      "answers ValidationFailed without %s",
      async (missing) => {
        const { token, digest } = await invite();
        const query = new URLSearchParams({ token, user_email_hash: digest });
        query.delete(missing);

        const response = await testHelper.makeAuthenticatedRequest(
          "GET",
          `/org/${owner.organization.id}/org_info_invitee?${query.toString()}`,
          invitee.accessToken,
        );

        expect(response.statusCode).toBe(400);
        expect(response.json().error_code).toBe("ValidationFailed");
      },
    );
  });

  describe("removing an invitation", () => {
    it("revoking deletes the row even when created_on and ttl are null", async () => {
      const { token } = await invite();
      const { id } = (await invitationRow(token))!;
      await testHelper
        .getDataSource()
        .query(
          "UPDATE invitation SET created_on = NULL, ttl = NULL WHERE id = $1",
          [id],
        );

      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${owner.organization.id}/invitations/${id}`,
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      expect(await invitationRow(token)).toBeNull();
    });

    it("joining deletes the invitation and its email even when their nullable dates are null", async () => {
      const { token, digest } = await invite();
      await clearNullableColumns(token);

      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${owner.organization.id}/join`,
        invitee.accessToken,
        { token, email_digest: digest },
      );

      expect(response.statusCode).toBe(201);
      expect(await invitationRow(token)).toBeNull();
      expect(await emailRow(token)).toBeNull();
    });
  });
});
