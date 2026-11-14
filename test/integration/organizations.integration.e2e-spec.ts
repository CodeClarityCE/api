import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Organizations Integration (e2e)", () => {
  let owner: TestUser;
  let member: TestUser;
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
      email: "owner@orgs.com",
      firstName: "Olivia",
      lastName: "Owner",
      orgName: "Team Org",
      role: MemberRole.OWNER,
    });
    member = await testHelper.createTestUser({
      email: "member@orgs.com",
      firstName: "Mark",
      lastName: "Member",
      organization: owner.organization,
      role: MemberRole.USER,
    });
    // A third member, so paging has more than one page
    await testHelper.createTestUser({
      email: "member2@orgs.com",
      firstName: "Second",
      lastName: "Member",
      organization: owner.organization,
      role: MemberRole.ADMIN,
    });
    outsider = await testHelper.createTestUser({
      email: "outsider@orgs.com",
      orgName: "Outsider Org",
      role: MemberRole.OWNER,
    });
  });

  describe("GET /org", () => {
    it("returns each membership with its role, join date and members", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/org?page=0&entries_per_page=50",
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        role: MemberRole.OWNER,
        joined_on: expect.any(String),
        organization: { id: owner.organization.id, name: "Team Org" },
      });
      expect(body.data[0].organization.organizationMemberships).toHaveLength(3);
      expect(body).toMatchObject({
        page: 0,
        entry_count: 1,
        entries_per_page: 50,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
      });
    });

    it("pages through the user's organisations with correct totals", async () => {
      const second = await testHelper.createTestUser({
        email: "owner-alt@orgs.com",
        orgName: "Second Org",
        role: MemberRole.OWNER,
      });
      // Owner joins the second org, so they now belong to two
      await testHelper.addMembership(
        owner.user,
        second.organization,
        MemberRole.USER,
      );

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/org?page=1&entries_per_page=1",
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body).toMatchObject({
        page: 1,
        entry_count: 1,
        entries_per_page: 1,
        total_entries: 2,
        total_pages: 2,
        matching_count: 2,
      });
    });
  });

  describe("GET /org/:orgId/members", () => {
    it("lists the members with their user and role", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${owner.organization.id}/members?page=0&entries_per_page=50`,
        member.accessToken,
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(
        body.data.map((m: { user: { email: string }; role: number }) => [
          m.user.email,
          m.role,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["owner@orgs.com", MemberRole.OWNER],
          ["member@orgs.com", MemberRole.USER],
          ["member2@orgs.com", MemberRole.ADMIN],
        ]),
      );
      expect(body).toMatchObject({
        page: 0,
        entry_count: 3,
        entries_per_page: 50,
        total_entries: 3,
        total_pages: 1,
        matching_count: 3,
      });
    });

    it("pages the members with correct totals", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${owner.organization.id}/members?page=1&entries_per_page=2`,
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body).toMatchObject({
        page: 1,
        entry_count: 1,
        entries_per_page: 2,
        total_entries: 3,
        total_pages: 2,
        matching_count: 3,
      });
    });

    it("refuses someone outside the organisation", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${owner.organization.id}/members`,
        outsider.accessToken,
      );

      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });
  });
});
