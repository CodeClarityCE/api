import { EmailService } from "../../src/base_modules/email/email.service";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Deleting an organization (e2e)", () => {
  let owner: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@orgdelete.com",
      orgName: "Doomed Org",
      role: MemberRole.OWNER,
    });
    outsider = await testHelper.createTestUser({
      email: "outsider@orgdelete.com",
      orgName: "Outsider Org",
    });
    jest
      .spyOn(testHelper.getApp().get(EmailService), "sendOrganizationInvite")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function deleteOrg(by: TestUser): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "DELETE",
      `/org/${owner.organization.id}`,
      by.accessToken,
    );
  }

  function orgRow(): Promise<Organization | null> {
    return testHelper
      .getDataSource()
      .getRepository(Organization)
      .findOneBy({ id: owner.organization.id });
  }

  function membershipCount(): Promise<number> {
    return testHelper
      .getDataSource()
      .getRepository(OrganizationMemberships)
      .countBy({ organization: { id: owner.organization.id } });
  }

  async function addMember(email: string, role: MemberRole): Promise<TestUser> {
    return testHelper.createTestUser({
      email,
      organization: owner.organization,
      role,
    });
  }

  it.each([MemberRole.USER, MemberRole.MODERATOR, MemberRole.ADMIN])(
    "refuses a member with role %s who is not an owner",
    async (role) => {
      const member = await addMember("member@orgdelete.com", role);

      const response = await deleteOrg(member);

      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
      expect(await orgRow()).not.toBeNull();
      expect(await membershipCount()).toBe(2);
    },
  );

  it("refuses a signed-in user who is not a member", async () => {
    const response = await deleteOrg(outsider);

    expect(response.statusCode).toBe(403);
    expect(response.json().error_code).toBe("NotAuthorized");
    expect(await orgRow()).not.toBeNull();
    expect(await membershipCount()).toBe(1);
  });

  it("refuses to delete a personal organization", async () => {
    await testHelper
      .getDataSource()
      .getRepository(Organization)
      .update({ id: owner.organization.id }, { personal: true });

    const response = await deleteOrg(owner);

    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe("PersonalOrgCannotBeModified");
    expect(await orgRow()).not.toBeNull();
    expect(await membershipCount()).toBe(1);
  });

  it("keeps every membership when the organization row cannot be deleted", async () => {
    await addMember("member@orgdelete.com", MemberRole.USER);
    // An open invitation references the organization, so its delete fails.
    const invite = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${owner.organization.id}/create_invite`,
      owner.accessToken,
      { user_email: "outsider@orgdelete.com", role: MemberRole.USER },
    );
    expect(invite.statusCode).toBe(201);

    const response = await deleteOrg(owner);

    expect(response.statusCode).toBe(500);
    expect(response.json().error_code).toBe("InternalError");
    expect(await orgRow()).not.toBeNull();
    expect(await membershipCount()).toBe(2);
  });

  it("lets an owner delete an unused organization", async () => {
    await addMember("member@orgdelete.com", MemberRole.USER);

    const response = await deleteOrg(owner);

    expect(response.statusCode).toBe(200);
    expect(await orgRow()).toBeNull();
    expect(await membershipCount()).toBe(0);
  });
});
