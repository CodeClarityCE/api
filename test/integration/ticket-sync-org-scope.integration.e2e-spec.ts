import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { TicketExternalLink } from "../../src/codeclarity_modules/tickets/ticket-external-link.entity";
import { createProject } from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// Stands in for the ClickUp API: creates, reads and deletes tasks.
let taskCount = 0;
function clickUpReply(url: string, init?: RequestInit): Response {
  const method = init?.method ?? "GET";
  if (method === "POST" && url.includes("/task")) {
    taskCount += 1;
    return Response.json({
      id: `task-${taskCount}`,
      url: `https://app.clickup.com/t/task-${taskCount}`,
    });
  }
  if (method === "GET" && url.includes("/task/")) {
    return Response.json({ status: { status: "complete" }, archived: false });
  }
  if (method === "DELETE" && url.includes("/task/")) {
    return Response.json({});
  }
  return new Response("not found", { status: 404 });
}

describe("Ticket sync is scoped to the organization (e2e)", () => {
  let owner: TestUser;
  let other: TestUser;
  let fetchSpy: jest.SpyInstance;
  const realFetch = global.fetch;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@syncscope.com",
      orgName: "Own Org",
      role: MemberRole.ADMIN,
    });
    other = await testHelper.createTestUser({
      email: "other@syncscope.com",
      orgName: "Other Org",
      role: MemberRole.ADMIN,
    });
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (!url.startsWith("https://api.clickup.com")) {
          return realFetch(input, init);
        }
        return clickUpReply(url, init);
      });
    await connectClickUp(owner, "l1");
    await connectClickUp(other, "l2");
    fetchSpy.mockClear();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function request(
    user: TestUser,
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: object,
    orgId: string = user.organization.id,
  ): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      method,
      `/org/${orgId}/tickets${path}`,
      user.accessToken,
      body,
    );
  }

  async function connectClickUp(user: TestUser, listId: string): Promise<void> {
    const response = await request(user, "POST", "/integrations/clickup", {
      auth_method: "API_KEY",
      api_key: "pk_key",
      list_id: listId,
    });
    expect(response.statusCode).toBeLessThan(300);
  }

  async function createTicket(user: TestUser, title: string): Promise<string> {
    const projectId = await createProject(user, `${title} project`);
    const response = await request(user, "POST", "", {
      title,
      description: title,
      priority: "HIGH",
      type: "VULNERABILITY",
      // Syncing a ticket without a score fails in the description formatter.
      severity_score: 7.5,
      project_id: projectId,
    });
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  // Creates a ticket of the user's org and links it to a ClickUp task.
  async function linkedTicket(
    user: TestUser,
    title: string,
  ): Promise<{ ticketId: string; linkId: string }> {
    const ticketId = await createTicket(user, title);
    const synced = await request(user, "POST", `/${ticketId}/sync/CLICKUP`);
    expect(synced.statusCode).toBeLessThan(300);
    const links = await request(user, "GET", `/${ticketId}/external-links`);
    return { ticketId, linkId: links.json().data[0].id };
  }

  function linksOf(ticketId: string): Promise<TicketExternalLink[]> {
    return testHelper
      .getDataSource()
      .getRepository(TicketExternalLink)
      .find({ where: { ticket: { id: ticketId } } });
  }

  async function ticketStatus(
    user: TestUser,
    ticketId: string,
  ): Promise<string> {
    const response = await request(user, "GET", `/${ticketId}`);
    return response.json().data.status;
  }

  const clickUpCalls = (): string[] =>
    fetchSpy.mock.calls
      .map(([input]) => String(input instanceof Request ? input.url : input))
      .filter((url) => url.includes("clickup.com"));

  // Each sync endpoint, for a ticket and link of the given ids.
  const endpoints = (
    ticketId: string,
    linkId: string,
  ): [string, "GET" | "POST" | "DELETE", string, object?][] => [
    ["read links", "GET", `/${ticketId}/external-links`],
    ["sync", "POST", `/${ticketId}/sync/CLICKUP`],
    ["unlink", "DELETE", `/${ticketId}/sync/${linkId}?delete_external=true`],
    ["sync from external", "POST", `/${ticketId}/sync-from-external/${linkId}`],
    ["bulk sync", "POST", "/bulk-sync/CLICKUP", { ticket_ids: [ticketId] }],
    [
      "bulk sync from external",
      "POST",
      "/bulk-sync-from-external",
      { ticket_ids: [ticketId] },
    ],
  ];

  it("lets a member sync, read links, sync back and unlink their own tickets", async () => {
    const member = await testHelper.createTestUser({
      email: "member@syncscope.com",
      organization: owner.organization,
      role: MemberRole.USER,
    });
    const ticketId = await createTicket(owner, "Own ticket");

    const synced = await request(member, "POST", `/${ticketId}/sync/CLICKUP`);
    expect(synced.statusCode).toBeLessThan(300);
    expect(synced.json().data.external_id).toBe("task-1");

    const links = await request(member, "GET", `/${ticketId}/external-links`);
    expect(links.statusCode).toBe(200);
    const [link] = links.json().data;
    expect(link).toEqual(expect.objectContaining({ external_id: "task-1" }));

    const back = await request(
      member,
      "POST",
      `/${ticketId}/sync-from-external/${link.id}`,
    );
    expect(back.statusCode).toBeLessThan(300);
    expect(back.json().data.updated).toBe(true);

    const unlinked = await request(
      member,
      "DELETE",
      `/${ticketId}/sync/${link.id}`,
    );
    expect(unlinked.statusCode).toBe(200);
    expect(await linksOf(ticketId)).toEqual([]);
  });

  describe("for a user outside the organization", () => {
    let ticketId: string;
    let linkId: string;

    beforeEach(async () => {
      ({ ticketId, linkId } = await linkedTicket(owner, "Own ticket"));
      fetchSpy.mockClear();
    });

    it("refuses every sync endpoint with 403, without calling ClickUp", async () => {
      for (const [name, method, path, body] of endpoints(ticketId, linkId)) {
        const response = await request(
          other,
          method,
          path,
          body,
          owner.organization.id,
        );

        expect({ name, status: response.statusCode }).toEqual({
          name,
          status: 403,
        });
        expect(response.json().error_code).toBe("NotAuthorized");
      }
      expect(clickUpCalls()).toEqual([]);
      expect(await linksOf(ticketId)).toHaveLength(1);
      expect(await ticketStatus(owner, ticketId)).toBe("OPEN");
    });
  });

  describe("for a ticket of another organization", () => {
    let foreignTicket: string;
    let foreignLink: string;

    beforeEach(async () => {
      ({ ticketId: foreignTicket, linkId: foreignLink } = await linkedTicket(
        other,
        "Foreign ticket",
      ));
      fetchSpy.mockClear();
    });

    it.each(["read links", "sync", "unlink", "sync from external"])(
      "answers 404 to %s and changes nothing",
      async (which) => {
        const [, method, path, body] = endpoints(
          foreignTicket,
          foreignLink,
        ).find(([name]) => name === which)!;

        const response = await request(owner, method, path, body);

        expect(response.statusCode).toBe(404);
        expect(clickUpCalls()).toEqual([]);
        expect(await linksOf(foreignTicket)).toHaveLength(1);
        expect(await ticketStatus(other, foreignTicket)).toBe("OPEN");
      },
    );

    it("bulk syncs only the organization's own tickets", async () => {
      const ownTicket = await createTicket(owner, "Own ticket");
      const unsyncedForeign = await createTicket(other, "Unsynced foreign");

      const response = await request(owner, "POST", "/bulk-sync/CLICKUP", {
        ticket_ids: [ownTicket, unsyncedForeign],
      });

      expect(response.statusCode).toBeLessThan(300);
      const { synced, failed } = response.json().data;
      expect(synced.map((s: any) => s.ticket_id)).toEqual([ownTicket]);
      expect(failed.map((f: any) => f.ticket_id)).toEqual([unsyncedForeign]);
      expect(await linksOf(ownTicket)).toHaveLength(1);
      expect(await linksOf(unsyncedForeign)).toEqual([]);
    });

    it("bulk syncs from external only the organization's own tickets", async () => {
      const { ticketId: ownTicket } = await linkedTicket(owner, "Own ticket");
      fetchSpy.mockClear();

      const response = await request(
        owner,
        "POST",
        "/bulk-sync-from-external",
        { ticket_ids: [ownTicket, foreignTicket] },
      );

      expect(response.statusCode).toBeLessThan(300);
      const { updated, failed } = response.json().data;
      expect(updated.map((u: any) => u.ticket_id)).toEqual([ownTicket]);
      expect(failed.map((f: any) => f.ticket_id)).toEqual([foreignTicket]);
      expect(clickUpCalls()).toHaveLength(1);
      expect(await ticketStatus(other, foreignTicket)).toBe("OPEN");
    });
  });
});
