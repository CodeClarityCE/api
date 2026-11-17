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
  ): Promise<any> {
    const query = new URLSearchParams({ token, user_email_hash: digest });
    return testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${owner.organization.id}/org_info_invitee?${query.toString()}`,
      user.accessToken,
    );
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
  });
});
