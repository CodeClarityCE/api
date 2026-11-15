import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const GOOD_KEY = "pk_good";
const STORED_KEY = "pk_stored";

// Stands in for the ClickUp API: only GOOD_KEY and STORED_KEY are accepted.
function clickUpReply(url: string, init?: RequestInit): Response {
  const token = (init?.headers as Record<string, string> | undefined)?.[
    "Authorization"
  ];
  if (token !== GOOD_KEY && token !== STORED_KEY) {
    return new Response(
      JSON.stringify({ err: "Token invalid", ECODE: "OAUTH_025" }),
      { status: 401 },
    );
  }
  if (url.endsWith("/user")) {
    return Response.json({
      user: { id: 7, username: "Jane", email: "jane@example.com" },
    });
  }
  if (url.endsWith("/team")) {
    return Response.json({ teams: [{ id: "ws1", name: "Workspace" }] });
  }
  if (url.includes("/team/ws1/space")) {
    return Response.json({ spaces: [{ id: "sp1", name: "Space" }] });
  }
  return new Response("not found", { status: 404 });
}

describe("Ticket integrations (e2e)", () => {
  let user: TestUser;
  let base: string;
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
    user = await testHelper.createTestUser({
      email: "admin@tickets.com",
      role: MemberRole.ADMIN,
    });
    base = `/org/${user.organization.id}/tickets/integrations`;
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (!url.startsWith("https://api.clickup.com")) {
          return realFetch(input, init);
        }
        return clickUpReply(url, init);
      });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const integrations = async (): Promise<unknown[]> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      base,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json().data as unknown[];
  };

  const verify = async (
    apiKey: string,
  ): Promise<{ success: boolean; error?: string; user_info?: unknown }> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `${base}/CLICKUP/verify`,
      user.accessToken,
      { auth_method: "API_KEY", api_key: apiKey },
    );
    expect(response.statusCode).toBe(200);
    return response.json().data;
  };

  it("stores nothing when verifying an invalid key", async () => {
    const result = await verify("pk_bad");

    expect(result.success).toBe(false);
    expect(await integrations()).toEqual([]);
  });

  it("stores nothing when verifying a valid key", async () => {
    const result = await verify(GOOD_KEY);

    expect(result).toMatchObject({
      success: true,
      user_info: { name: "Jane" },
    });
    expect(await integrations()).toEqual([]);
  });

  it("explains a rejected key in plain words", async () => {
    const result = await verify("pk_bad");

    expect(result.error).toBe(
      "ClickUp did not accept these credentials. Check the API key or reconnect with OAuth.",
    );
  });

  it("explains a failed test of a saved integration in plain words", async () => {
    const saved = await testHelper.makeAuthenticatedRequest(
      "POST",
      `${base}/clickup`,
      user.accessToken,
      { auth_method: "API_KEY", api_key: "pk_revoked", list_id: "l1" },
    );
    expect(saved.statusCode).toBeLessThan(300);

    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `${base}/CLICKUP/test`,
      user.accessToken,
    );

    const error = response.json().data.error as string;
    expect(error).not.toContain("{");
    expect(error).toContain("ClickUp did not accept these credentials");
  });

  it("lists workspaces and spaces with unsaved credentials", async () => {
    const headers = { "x-integration-api-key": GOOD_KEY };

    const workspaces = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${base}/CLICKUP/workspaces`,
      user.accessToken,
      undefined,
      headers,
    );
    const spaces = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${base}/CLICKUP/spaces/ws1`,
      user.accessToken,
      undefined,
      headers,
    );

    expect(workspaces.json().data).toEqual([{ id: "ws1", name: "Workspace" }]);
    expect(spaces.json().data).toEqual([{ id: "sp1", name: "Space" }]);
    expect(await integrations()).toEqual([]);
  });

  it("prefers unsaved credentials over the saved ones", async () => {
    await testHelper.makeAuthenticatedRequest(
      "POST",
      `${base}/clickup`,
      user.accessToken,
      { auth_method: "OAUTH", access_token: STORED_KEY, list_id: "l1" },
    );

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${base}/CLICKUP/workspaces`,
      user.accessToken,
      undefined,
      { "x-integration-api-key": "pk_bad" },
    );

    expect(response.statusCode).toBe(400);
  });

  it("refuses credential checks from a member below admin", async () => {
    const member = await testHelper.createTestUser({
      email: "member@tickets.com",
      role: MemberRole.USER,
      organization: user.organization,
    });

    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `${base}/CLICKUP/verify`,
      member.accessToken,
      { auth_method: "API_KEY", api_key: GOOD_KEY },
    );

    expect(response.statusCode).toBe(403);
  });

  it("refuses credential checks from outside the organisation", async () => {
    const outsider = await testHelper.createTestUser({
      email: "outsider@tickets.com",
    });

    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `${base}/CLICKUP/verify`,
      outsider.accessToken,
      { auth_method: "API_KEY", api_key: GOOD_KEY },
    );

    expect(response.statusCode).toBe(403);
  });

  it.each([
    [
      "POST",
      "clickup",
      { auth_method: "API_KEY", api_key: GOOD_KEY, list_id: "l1" },
    ],
    ["DELETE", "CLICKUP", undefined],
    ["PATCH", "CLICKUP/toggle?enabled=false", undefined],
  ] as const)(
    "refuses %s %s from a member below admin",
    async (method, path, body) => {
      const member = await testHelper.createTestUser({
        email: "member@tickets.com",
        role: MemberRole.USER,
        organization: user.organization,
      });

      const response = await testHelper.makeAuthenticatedRequest(
        method,
        `${base}/${path}`,
        member.accessToken,
        body,
      );

      expect(response.statusCode).toBe(403);
    },
  );

  it.each([
    ["DELETE", "clickup"],
    ["POST", "NOPE/test"],
    ["PATCH", "clickup/toggle?enabled=true"],
    ["GET", "jira-cloud/workspaces"],
  ] as const)("rejects %s %s as a bad provider", async (method, path) => {
    const response = await testHelper.makeAuthenticatedRequest(
      method,
      `${base}/${path}`,
      user.accessToken,
    );

    expect(response.statusCode).toBe(400);
  });
});
