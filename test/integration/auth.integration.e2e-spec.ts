import { User } from "../../src/base_modules/users/users.entity";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

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

    // Bug: a duplicate email hits the unique index and returns 500, not 409.
    it.failing("should reject signup with duplicate email", async () => {
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

    // Bug: an unknown email returns UserDoesNotExist, which reveals who has an account.
    it.failing("should reject login with invalid email", async () => {
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

    // Bug: the guard checks "activated" before validity, so this returns 400.
    it.failing("should reject request with invalid token", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        "invalid-token",
      );

      expect(response.statusCode).toBe(401);
      expect(response.json().error_code).toBe("NotAuthenticated");
    });

    // Bug: same guard order as the invalid token case.
    it.failing("should reject request with expired token", async () => {
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
