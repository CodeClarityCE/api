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
  if (init?.method === "POST") {
    const { name } = JSON.parse(init.body as string) as { name: string };
    return Response.json({ id: "new1", name });
  }
  if (url.includes("/team/ws1/space")) {
    return Response.json({ spaces: [{ id: "sp1", name: "Space" }] });
  }
  if (url.includes("/space/sp1/folder")) {
    return Response.json({ folders: [{ id: "f1", name: "Folder" }] });
  }
  if (url.includes("/folder/f1/list")) {
    return Response.json({ lists: [{ id: "l1", name: "List" }] });
  }
  return new Response("not found", { status: 404 });
}

// Every endpoint that needs an org admin, beyond configure, remove, verify and toggle.
const ADMIN_ONLY = [
  ["POST", "CLICKUP/test", undefined],
  ["GET", "CLICKUP/workspaces", undefined],
  ["GET", "CLICKUP/spaces/ws1", undefined],
  ["GET", "CLICKUP/folders/sp1", undefined],
  ["GET", "CLICKUP/lists/f1", undefined],
  ["POST", "CLICKUP/workspaces/ws1/spaces", { name: "New" }],
  ["POST", "CLICKUP/spaces/sp1/folders", { name: "New" }],
  ["POST", "CLICKUP/folders/f1/lists", { name: "New" }],
  ["POST", "CLICKUP/spaces/sp1/lists", { name: "New" }],
  [
    "GET",
    "clickup/oauth/url?redirect_uri=https://app.example.com/cb",
    undefined,
  ],
  [
    "POST",
    "clickup/oauth/callback",
    { code: "c1", redirect_uri: "https://app.example.com/cb" },
  ],
] as const;

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

  describe("with a saved ClickUp integration", () => {
    beforeEach(async () => {
      const saved = await testHelper.makeAuthenticatedRequest(
        "POST",
        `${base}/clickup`,
        user.accessToken,
        { auth_method: "API_KEY", api_key: STORED_KEY, list_id: "l1" },
      );
      expect(saved.statusCode).toBeLessThan(300);
      fetchSpy.mockClear();
    });

    const clickUpCalls = (): unknown[] =>
      fetchSpy.mock.calls.filter(([input]) =>
        String(input instanceof Request ? input.url : input).includes(
          "clickup.com",
        ),
      );

    describe.each([
      ["a member below admin", MemberRole.USER],
      ["a moderator", MemberRole.MODERATOR],
      ["a user outside the organisation", undefined],
    ])("refuses %s", (_who, role) => {
      let caller: TestUser;

      beforeEach(async () => {
        caller = await testHelper.createTestUser({
          email: "caller@tickets.com",
          ...(role === undefined
            ? {}
            : { role, organization: user.organization }),
        });
      });

      it.each(ADMIN_ONLY)(
        "%s %s, without calling ClickUp",
        async (method, path, body) => {
          const response = await testHelper.makeAuthenticatedRequest(
            method,
            `${base}/${path}`,
            caller.accessToken,
            body,
          );

          expect(response.statusCode).toBe(403);
          expect(response.json().error_code).toBe("NotAuthorized");
          expect(clickUpCalls()).toEqual([]);
        },
      );
    });

    it.each([
      ["POST", "CLICKUP/test", { success: true }],
      ["GET", "CLICKUP/workspaces", [{ id: "ws1", name: "Workspace" }]],
      ["GET", "CLICKUP/spaces/ws1", [{ id: "sp1", name: "Space" }]],
      ["GET", "CLICKUP/folders/sp1", [{ id: "f1", name: "Folder" }]],
      ["GET", "CLICKUP/lists/f1", [{ id: "l1", name: "List" }]],
    ] as const)(
      "answers an admin on %s %s from the saved credentials",
      async (method, path, data) => {
        const response = await testHelper.makeAuthenticatedRequest(
          method,
          `${base}/${path}`,
          user.accessToken,
        );

        expect(response.statusCode).toBeLessThan(300);
        expect(response.json().data).toMatchObject(data);
      },
    );

    it.each([
      "CLICKUP/workspaces/ws1/spaces",
      "CLICKUP/spaces/sp1/folders",
      "CLICKUP/folders/f1/lists",
      "CLICKUP/spaces/sp1/lists",
    ])("lets an admin create through POST %s", async (path) => {
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `${base}/${path}`,
        user.accessToken,
        { name: "New" },
      );

      expect(response.statusCode).toBe(201);
      expect(response.json().data).toEqual({ id: "new1", name: "New" });
    });

    it.each(["GET", "POST"] as const)(
      "gets past authorization for an admin on %s OAuth",
      async (method) => {
        const path =
          method === "GET"
            ? "clickup/oauth/url?redirect_uri=https://app.example.com/cb"
            : "clickup/oauth/callback";

        const response = await testHelper.makeAuthenticatedRequest(
          method,
          `${base}/${path}`,
          user.accessToken,
          method === "POST"
            ? { code: "c1", redirect_uri: "https://app.example.com/cb" }
            : undefined,
        );

        // The test environment has no ClickUp OAuth app configured.
        expect(response.statusCode).toBe(400);
        expect(response.json().error_message).toContain(
          "ClickUp OAuth is not configured",
        );
      },
    );

    it("lists the integrations for a member below admin", async () => {
      const member = await testHelper.createTestUser({
        email: "member@tickets.com",
        role: MemberRole.USER,
        organization: user.organization,
      });

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        base,
        member.accessToken,
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([
        expect.objectContaining({ provider: "CLICKUP", has_config: true }),
      ]);
    });

    it("refuses to list the integrations to a user outside the organisation", async () => {
      const outsider = await testHelper.createTestUser({
        email: "outsider@tickets.com",
      });

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        base,
        outsider.accessToken,
      );

      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("NotAuthorized");
    });
  });

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
