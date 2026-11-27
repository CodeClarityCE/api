import { readFileSync } from "fs";
import * as jwt from "jsonwebtoken";

import { User } from "../../src/base_modules/users/users.entity";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// The key the API signs with, for tokens the API itself would not issue.
const privateKey = readFileSync("./jwt/private.pem", "utf8");

// The claims the API puts in every user token.
function claimsOf(account: TestUser) {
  return {
    sub: account.user.id,
    userId: account.user.id,
    roles: ["ROLE_USER"],
    activated: true,
  };
}

// New accounts must confirm by email, which tests skip by updating the row.
async function verifyRegistration(email: string): Promise<void> {
  await testHelper
    .getDataSource()
    .getRepository(User)
    .update({ email }, { registration_verified: true, activated: true });
}

function registrationBody(email: string, handle: string, password: string) {
  return {
    email,
    handle,
    first_name: "John",
    last_name: "Doe",
    password,
    password_confirmation: password,
  };
}

describe("Authentication Integration (e2e)", () => {
  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
  });

  describe("POST /auth/register", () => {
    it("should successfully register a new user", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/register",
        registrationBody(
          "newuser@example.com",
          "newuser",
          "SecurePassword123!",
        ),
      );

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        status_code: 201,
        status: "success",
        id: expect.any(String),
      });
    });

    it("should reject signup with invalid email", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/register",
        registrationBody("invalid-email", "invalid", "SecurePassword123!"),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("ValidationFailed");
    });

    it("should reject signup with weak password", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/register",
        registrationBody("test@example.com", "weakuser", "123"),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("ValidationFailed");
    });

    it("should reject signup with mismatched passwords", async () => {
      const response = await testHelper.makeRequest("POST", "/auth/register", {
        ...registrationBody("test@example.com", "mismatch", "SecurePassword1!"),
        password_confirmation: "DifferentPassword1!",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("PasswordsDoNotMatch");
    });
    it("should reject signup with duplicate email", async () => {
      const body = registrationBody(
        "duplicate@example.com",
        "duplicate",
        "SecurePassword123!",
      );
      await testHelper.makeRequest("POST", "/auth/register", body);

      const response = await testHelper.makeRequest("POST", "/auth/register", {
        ...body,
        handle: "duplicate2",
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error_code).toBe("EmailAlreadyExists");
    });
  });

  describe("POST /auth/authenticate", () => {
    beforeEach(async () => {
      await testHelper.createTestUser({
        email: "login@example.com",
        password: "LoginPassword123!",
      });
    });

    it("should successfully login with valid credentials", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/authenticate",
        { email: "login@example.com", password: "LoginPassword123!" },
      );

      expect(response.statusCode).toBe(201);
      expect(response.json().data).toEqual(
        expect.objectContaining({
          token: expect.any(String),
          refresh_token: expect.any(String),
        }),
      );
    });
    it("should reject login with invalid email", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/authenticate",
        { email: "nonexistent@example.com", password: "LoginPassword123!" },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("WrongCredentials");
    });

    it("should reject login with invalid password", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/authenticate",
        { email: "login@example.com", password: "WrongPassword" },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("WrongCredentials");
    });

    it("should reject login with malformed request", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/authenticate",
        { email: "not-an-email", password: "" },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("ValidationFailed");
    });
  });

  describe("GET /auth/user", () => {
    let testUser: TestUser;

    beforeEach(async () => {
      testUser = await testHelper.createTestUser({
        email: "profile@example.com",
        password: "ProfilePassword123!",
      });
    });

    it("should return user profile with valid token", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        testUser.accessToken,
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(
        expect.objectContaining({
          id: testUser.user.id,
          email: "profile@example.com",
          first_name: "Test",
          last_name: "User",
        }),
      );
    });

    it("should reject request without token", async () => {
      const response = await testHelper.makeRequest("GET", "/auth/user");

      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });
    it("should never return a password hash", async () => {
      for (const url of ["/auth/user", "/org?page=0&entries_per_page=5"]) {
        const response = await testHelper.makeAuthenticatedRequest(
          "GET",
          url,
          testUser.accessToken,
        );

        expect(response.statusCode).toBe(200);
        expect(response.payload).not.toContain('"password"');
      }
    });

    it("should reject request with invalid token", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        "invalid-token",
      );

      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });
    it("should reject request with expired token", async () => {
      // A malformed token whose payload is already expired.
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid";

      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        expiredToken,
      );

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /auth/refresh", () => {
    let testUser: TestUser;

    beforeEach(async () => {
      testUser = await testHelper.createTestUser({
        email: "refresh@example.com",
        password: "RefreshPassword123!",
      });
    });

    it("should issue an access token from a refresh token", async () => {
      const response = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token: testUser.refreshToken,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.token).toEqual(expect.any(String));
    });

    it("should issue a token that works on protected routes", async () => {
      const response = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token: testUser.refreshToken,
      });

      const profile = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        response.json().data.token,
      );
      expect(profile.statusCode).toBe(200);
    });

    it("should reject refresh with invalid refresh token", async () => {
      const response = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token: "invalid-refresh-token",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });

    it("should reject refresh without refresh token", async () => {
      const response = await testHelper.makeRequest(
        "POST",
        "/auth/refresh",
        {},
      );

      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });
  });

  describe("Token types", () => {
    let testUser: TestUser;

    beforeEach(async () => {
      testUser = await testHelper.createTestUser({
        email: "types@example.com",
        password: "TypesPassword123!",
      });
    });

    it("should refuse a refresh token as bearer", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        testUser.refreshToken,
      );

      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });

    it("should refuse an access token at /auth/refresh", async () => {
      const response = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token: testUser.accessToken,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });

    // Sends the token as bearer and to /auth/refresh, and expects both to refuse it.
    async function expectRefusedOnBoth(token: string): Promise<void> {
      const bearer = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        token,
      );
      const refresh = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token: token,
      });

      expect(bearer.statusCode).toBe(401);
      expect(refresh.statusCode).toBe(401);
    }

    it("should refuse an old token with no type or audience on both", async () => {
      // Signed with the real key, with no typ header or audience.
      const untyped = jwt.sign(claimsOf(testUser), privateKey, {
        algorithm: "ES512",
        expiresIn: "15m",
      });

      await expectRefusedOnBoth(untyped);
    });

    it.each([
      ["an access typ with the refresh audience", "at+jwt", "refresh"],
      ["a refresh typ with the access audience", "refresh+jwt", "access"],
    ])("should refuse %s on both", async (_name, typ, audience) => {
      const mixed = jwt.sign(claimsOf(testUser), privateKey, {
        algorithm: "ES512",
        expiresIn: "15m",
        header: { alg: "ES512", typ },
        audience: `codeclarity:${audience}`,
      });

      await expectRefusedOnBoth(mixed);
    });

    it("should sign in, call, refresh and call again", async () => {
      const login = await testHelper.makeRequest("POST", "/auth/authenticate", {
        email: "types@example.com",
        password: "TypesPassword123!",
      });
      const { token, refresh_token } = login.json().data;

      const first = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        token,
      );
      const refresh = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token,
      });
      const second = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        refresh.json().data.token,
      );

      expect(first.statusCode).toBe(200);
      expect(refresh.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      expect(second.json().data.email).toBe("types@example.com");
    });

    it("should issue access tokens that expire after 15 minutes", async () => {
      const refresh = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token: testUser.refreshToken,
      });

      for (const token of [testUser.accessToken, refresh.json().data.token]) {
        const { iat, exp } = jwt.decode(token) as jwt.JwtPayload;
        expect(exp! - iat!).toBe(15 * 60);
      }
    });

    it("should refuse an old refresh JWT at /auth/refresh", async () => {
      // The refresh tokens issued before rotation were JWTs like this one.
      const oldRefresh = jwt.sign(claimsOf(testUser), privateKey, {
        algorithm: "ES512",
        expiresIn: "7d",
        header: { alg: "ES512", typ: "refresh+jwt" },
        audience: "codeclarity:refresh",
      });

      await expectRefusedOnBoth(oldRefresh);
    });
  });

  describe("PATCH /users/:userId/update_password", () => {
    let account: TestUser;

    beforeEach(async () => {
      account = await testHelper.createTestUser({
        email: "password@example.com",
        password: "CurrentPassword123!",
      });
    });

    function changePassword(oldPassword: string) {
      return testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/users/${account.user.id}/update_password`,
        account.accessToken,
        {
          old_password: oldPassword,
          password: "BrandNewPassword123!",
          password_confirmation: "BrandNewPassword123!",
        },
      );
    }

    it("should change the password when the current one is right", async () => {
      const response = await changePassword("CurrentPassword123!");

      expect(response.statusCode).toBe(200);
    });

    it("should report a wrong current password as a client error", async () => {
      const response = await changePassword("NotMyPassword123!");

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error_code: "IncorrectCurrentPassword",
        error_message: "The current password is incorrect.",
      });
    });

    it("should explain mismatched new passwords in words", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/users/${account.user.id}/update_password`,
        account.accessToken,
        {
          old_password: "CurrentPassword123!",
          password: "BrandNewPassword123!",
          password_confirmation: "OtherNewPassword123!",
        },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error_code: "PasswordsDoNotMatch",
        error_message: "The passwords do not match.",
      });
    });
  });

  describe("Authentication Flow Integration", () => {
    it("should complete full authentication lifecycle", async () => {
      const email = "lifecycle@example.com";
      const password = "LifecyclePassword123!";

      // 1. Register
      const register = await testHelper.makeRequest(
        "POST",
        "/auth/register",
        registrationBody(email, "lifecycle", password),
      );
      expect(register.statusCode).toBe(201);

      // 2. Login is refused until the registration is verified
      const refused = await testHelper.makeRequest(
        "POST",
        "/auth/authenticate",
        { email, password },
      );
      expect(refused.statusCode).toBe(400);
      expect(refused.json().error_code).toBe("RegistrationNotVerified");

      // 3. Login once verified
      await verifyRegistration(email);
      const login = await testHelper.makeRequest("POST", "/auth/authenticate", {
        email,
        password,
      });
      expect(login.statusCode).toBe(201);
      const { token, refresh_token } = login.json().data;

      // 4. Access a protected resource
      const profile = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        token,
      );
      expect(profile.statusCode).toBe(200);
      expect(profile.json().data.email).toBe(email);

      // 5. Refresh (using the new token is covered by its own test)
      const refresh = await testHelper.makeRequest("POST", "/auth/refresh", {
        refresh_token,
      });
      expect(refresh.statusCode).toBe(201);
    });

    it("should handle concurrent authentication requests", async () => {
      const responses = await Promise.all(
        Array(5)
          .fill(null)
          .map((_, index) =>
            testHelper.makeRequest(
              "POST",
              "/auth/register",
              registrationBody(
                `concurrent${index}@example.com`,
                `concurrent${index}`,
                "ConcurrentPassword123!",
              ),
            ),
          ),
      );

      responses.forEach((response) => {
        expect(response.statusCode).toBe(201);
      });
      expect(new Set(responses.map((r) => r.json().id)).size).toBe(5);
    });
  });
});
