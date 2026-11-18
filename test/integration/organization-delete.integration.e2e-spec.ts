import { EmailService } from "../../src/base_modules/email/email.service";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import {
  failOrganizationDeletes,
  recordDeletedAnalysisStatuses,
} from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";
import {
  fillOrganization,
  givePersonalOrg,
  rowsLeft,
  type UsedOrganization,
} from "../utils/organization-fixtures";

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
    const allowDeletes = await failOrganizationDeletes();
    try {
      const response = await deleteOrg(owner);

      expect(response.statusCode).toBe(500);
      expect(response.json().error_code).toBe("InternalError");
    } finally {
      await allowDeletes();
    }
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

  describe("an organization in use", () => {
    let held: UsedOrganization;
    let member: TestUser;
    let memberPersonalOrgId: string;

    beforeEach(async () => {
      member = await addMember("member@orgdelete.com", MemberRole.USER);
      memberPersonalOrgId = await givePersonalOrg(member, owner.organization.id);
      held = await fillOrganization(owner, outsider);
    });

    const db = () => testHelper.getDataSource();

    it("starts with rows in every table it owns", async () => {
      const before = await rowsLeft(owner.organization.id, held);
      for (const [table, n] of Object.entries(before)) {
        expect([table, n > 0]).toEqual([table, true]);
      }
    });

    it("deletes everything the organization owns", async () => {
      const response = await deleteOrg(owner);

      expect(response.statusCode).toBe(200);
      const after = await rowsLeft(owner.organization.id, held);
      for (const [table, n] of Object.entries(after)) {
        expect([table, n]).toEqual([table, 0]);
      }
    });

    it("cancels the running analysis before deleting it", async () => {
      const recorder = await recordDeletedAnalysisStatuses();
      try {
        expect((await deleteOrg(owner)).statusCode).toBe(200);
        expect(await recorder.statuses()).toEqual({
          [held.analysisId]: "cancelled",
        });
      } finally {
        await recorder.stop();
      }
    });

    it("keeps an integration and a policy also linked to another organization", async () => {
      expect((await deleteOrg(owner)).statusCode).toBe(200);

      const integrationLinks = await db().query(
        `SELECT "organizationId" FROM organization_integrations_integration WHERE "integrationId" = $1`,
        [held.sharedIntegrationId],
      );
      expect(integrationLinks).toEqual([
        { organizationId: outsider.organization.id },
      ]);
      const policyLinks = await db().query(
        `SELECT "organizationId" FROM organization_policies_policy WHERE "policyId" = $1`,
        [held.sharedPolicyId],
      );
      expect(policyLinks).toEqual([
        { organizationId: outsider.organization.id },
      ]);
    });

    it("gives a member their personal organization as default", async () => {
      expect((await deleteOrg(owner)).statusCode).toBe(200);

      const [row] = await db().query(
        `SELECT default_org FROM "user" WHERE id = $1`,
        [member.user.id],
      );
      expect(row.default_org).toBe(memberPersonalOrgId);
    });

    it("deletes nothing when a step fails", async () => {
      const before = await rowsLeft(owner.organization.id, held);
      const allowDeletes = await failOrganizationDeletes();
      try {
        expect((await deleteOrg(owner)).statusCode).toBe(500);
      } finally {
        await allowDeletes();
      }

      expect(await rowsLeft(owner.organization.id, held)).toEqual(before);
      const [analysis] = await db().query(
        `SELECT status FROM analysis WHERE id = $1`,
        [held.analysisId],
      );
      expect(analysis.status).toBe("started");
    });
  });
});
