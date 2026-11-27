import {
  sessionHeaders,
  sessionOf,
  testHelper,
  type TestUser,
} from "../utils/integration-test-helper";

const EMAIL = "cookies@example.com";
const PASSWORD = "CookiePassword123!";

function signIn(): Promise<any> {
  return testHelper.makeRequest("POST", "/auth/authenticate", {
    email: EMAIL,
    password: PASSWORD,
  });
}

function setCookies(response: { headers: Record<string, unknown> }): string[] {
  const header = response.headers["set-cookie"];
  return Array.isArray(header) ? header : [String(header)];
}

describe("Web sign-ins in cookies (e2e)", () => {
  let account: TestUser;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    account = await testHelper.createTestUser({
      email: EMAIL,
      password: PASSWORD,
    });
  });

  describe("POST /auth/authenticate", () => {
    it("sets both tokens as HttpOnly host cookies and puts no token in the body", async () => {
      const response = await signIn();

      expect(response.statusCode).toBe(201);
      const cookies = setCookies(response);
      expect(cookies).toHaveLength(2);
      for (const cookie of cookies) {
        expect(cookie).toMatch(/^__Host-Http-cc_(access|refresh)=[\w.-]+; /);
        expect(cookie).toContain("; Path=/; HttpOnly; Secure; SameSite=Strict");
        expect(cookie).not.toMatch(/Domain=/i);
      }
      expect(response.json().data).toEqual({
        token_expiry: expect.any(String),
        refresh_token_expiry: expect.any(String),
      });
      const { accessToken, refreshToken } = sessionOf(response);
      expect(response.payload).not.toContain(accessToken);
      expect(response.payload).not.toContain(refreshToken);
    });

    it("sets no cookie for wrong credentials", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/authenticate",
        { email: EMAIL, password: "WrongPassword123!" },
      );
      expect(response.statusCode).toBe(400);
      expect(response.headers["set-cookie"]).toBeUndefined();
    });
  });

  describe("requests on a web sign-in", () => {
    it("are judged on the access cookie", async () => {
      const response = await testHelper.makeRequest(
        "GET",
        "/auth/user",
        undefined,
        sessionHeaders({ accessToken: account.accessToken }),
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().data.id).toBe(account.user.id);
    });

    it("are refused without the CSRF header, even for a read", async () => {
      const response = await testHelper.makeRequest(
        "GET",
        "/auth/user",
        undefined,
        { cookie: `__Host-Http-cc_access=${account.accessToken}` },
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("CrossSiteRequestRefused");
    });

    it.each([
      ["Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site" }],
      ["Sec-Fetch-Site same-site", { "sec-fetch-site": "same-site" }],
      ["an Origin on another site", { origin: "https://evil.example" }],
    ])("are refused with %s", async (_name, headers) => {
      const response = await testHelper.makeRequest(
        "PATCH",
        `/users/${account.user.id}/update_personal`,
        { first_name: "Mallory" },
        sessionHeaders({ accessToken: account.accessToken }, headers),
      );
      expect(response.statusCode).toBe(403);
      expect(response.json().error_code).toBe("CrossSiteRequestRefused");
    });

    it("accept the app's own same-origin requests", async () => {
      const response = await testHelper.makeRequest(
        "GET",
        "/auth/user",
        undefined,
        sessionHeaders(
          { accessToken: account.accessToken },
          { "sec-fetch-site": "same-origin", origin: "http://localhost:80" },
        ),
      );
      expect(response.statusCode).toBe(200);
    });

    it("are refused with no cookie", async () => {
      const response = await testHelper.makeRequest(
        "GET",
        "/auth/user",
        undefined,
        sessionHeaders({}),
      );
      expect(response.statusCode).toBe(401);
    });
  });

  describe("bearers", () => {
    it("refuse a user access token sent as a bearer", async () => {
      const response = await testHelper.makeRequest(
        "GET",
        "/auth/user",
        undefined,
        { authorization: `Bearer ${account.accessToken}` },
      );
      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });

    it("are judged alone: a valid cookie does not rescue a bad bearer", async () => {
      const response = await testHelper.makeRequest(
        "GET",
        "/auth/user",
        undefined,
        sessionHeaders(
          { accessToken: account.accessToken },
          { authorization: "Bearer ccot_not-a-real-token" },
        ),
      );
      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /auth/refresh", () => {
    it("rotates both cookies from the refresh cookie", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        undefined,
        sessionHeaders({ refreshToken: account.refreshToken }),
      );

      expect(response.statusCode).toBe(201);
      const next = sessionOf(response);
      expect(next.refreshToken).toEqual(expect.any(String));
      expect(next.refreshToken).not.toBe(account.refreshToken);
      expect(next.accessToken).toEqual(expect.any(String));
      expect(response.json().data).toEqual({
        token_expiry: expect.any(String),
        refresh_token_expiry: expect.any(String),
      });
    });

    it("ignores a refresh token in the body", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        { refresh_token: account.refreshToken },
        sessionHeaders({}),
      );
      expect(response.statusCode).toBe(401);
    });

    it("refuses a cross-site refresh without spending the token", async () => {
      const crossSite = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        undefined,
        sessionHeaders(
          { refreshToken: account.refreshToken },
          { "sec-fetch-site": "cross-site" },
        ),
      );
      expect(crossSite.statusCode).toBe(403);
      expect(crossSite.headers["set-cookie"]).toBeUndefined();

      const ours = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        undefined,
        sessionHeaders({ refreshToken: account.refreshToken }),
      );
      expect(ours.statusCode).toBe(201);
    });

    it("clears both cookies when the refresh is refused", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        undefined,
        sessionHeaders({ refreshToken: "spent-or-unknown" }),
      );
      expect(response.statusCode).toBe(401);
      expect(sessionOf(response)).toEqual({
        accessToken: "",
        refreshToken: "",
      });
    });
  });

  describe("POST /auth/sign_out", () => {
    it("ends the sign-in and clears both cookies", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/sign_out",
        undefined,
        sessionHeaders({
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
        }),
      );

      expect(response.statusCode).toBe(201);
      expect(sessionOf(response)).toEqual({
        accessToken: "",
        refreshToken: "",
      });
      for (const cookie of setCookies(response)) {
        expect(cookie).toContain("Max-Age=0;");
      }
      const refresh = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        undefined,
        sessionHeaders({ refreshToken: account.refreshToken }),
      );
      expect(refresh.statusCode).toBe(401);
    });

    it("refuses a cross-site sign-out and keeps the sign-in", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/sign_out",
        undefined,
        sessionHeaders(
          { refreshToken: account.refreshToken },
          { origin: "https://evil.example" },
        ),
      );
      expect(response.statusCode).toBe(403);

      const refresh = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        undefined,
        sessionHeaders({ refreshToken: account.refreshToken }),
      );
      expect(refresh.statusCode).toBe(201);
    });
  });

  describe("PATCH /users/:id/update_password", () => {
    it("sets the fresh sign-in as cookies", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/users/${account.user.id}/update_password`,
        account.accessToken,
        {
          old_password: PASSWORD,
          password: "BrandNewPassword123!",
          password_confirmation: "BrandNewPassword123!",
        },
      );

      expect(response.statusCode).toBe(200);
      const fresh = sessionOf(response);
      expect(fresh.accessToken).toEqual(expect.any(String));
      expect(fresh.refreshToken).toEqual(expect.any(String));
      expect(response.json().data).toEqual({
        token_expiry: expect.any(String),
        refresh_token_expiry: expect.any(String),
      });
    });
  });
});
