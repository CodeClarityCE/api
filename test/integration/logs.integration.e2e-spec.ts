import { CodeClarityLogger } from "../../src/services/logger.service";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// Error reports sent by the web app to POST /logs.
describe("Error reports (e2e)", () => {
  let user: TestUser;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser();
    errorSpy = jest
      .spyOn(CodeClarityLogger.prototype, "error")
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(CodeClarityLogger.prototype, "warn")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function report(body: unknown, accessToken = user.accessToken) {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      "/logs",
      accessToken,
      body,
    );
  }

  it("rejects a report without a session", async () => {
    const response = await testHelper.makeRequest("POST", "/logs", {
      level: "error",
      msg: "boom",
    });

    expect(response.statusCode).toBe(401);
  });
  it("logs a valid error report with the server's user, source and time", async () => {
    const before = Date.now();
    const response = await report({
      level: "error",
      msg: "Cannot read properties of undefined",
      fields: { route: "/projects", userId: "forged-user" },
      userId: "forged-user",
      service: "forged-service",
      time: "2000-01-01T00:00:00.000Z",
    });
    const after = Date.now();

    expect(response.statusCode).toBe(204);
    expect(response.payload).toBe("");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [msg, error, context] = errorSpy.mock.calls[0];
    expect(msg).toBe("Cannot read properties of undefined");
    expect(error).toBeUndefined();
    expect(context).toEqual({
      route: "/projects",
      userId: user.user.id,
      source: "frontend",
      receivedAt: expect.any(String),
    });
    const receivedAt = Date.parse(context.receivedAt);
    expect(receivedAt).toBeGreaterThanOrEqual(before);
    expect(receivedAt).toBeLessThanOrEqual(after);
  });

  it("logs a warn report at warn level", async () => {
    const response = await report({ level: "warn", msg: "Slow page" });

    expect(response.statusCode).toBe(204);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("Slow page", {
      userId: user.user.id,
      source: "frontend",
      receivedAt: expect.any(String),
    });
  });
  it("rejects an unknown level", async () => {
    const response = await report({ level: "info", msg: "hello" });

    expect(response.statusCode).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("rejects a message over 2 KB", async () => {
    const response = await report({ level: "error", msg: "x".repeat(2049) });

    expect(response.statusCode).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects a body over 16 KB", async () => {
    const response = await report({
      level: "error",
      msg: "boom",
      fields: { stack: "x".repeat(16 * 1024) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      error_code: "PayloadTooLarge",
      error_message: "Error report is over 16 KB",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("drops fields outside the allow-list", async () => {
    const response = await report({
      level: "error",
      msg: "boom",
      fields: {
        route: "/projects/1",
        component: "ProjectList",
        organizationId: "org-1",
        projectId: "project-1",
        analysisId: "analysis-1",
        stack: "Error: boom\n    at f",
        password: "hunter2",
        accessToken: "secret",
        formValue: "private",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(errorSpy.mock.calls[0][2]).toEqual({
      route: "/projects/1",
      component: "ProjectList",
      organizationId: "org-1",
      projectId: "project-1",
      analysisId: "analysis-1",
      stack: "Error: boom\n    at f",
      userId: user.user.id,
      source: "frontend",
      receivedAt: expect.any(String),
    });
  });
  it("limits each user to 30 reports a minute", async () => {
    const other = await testHelper.createTestUser({
      email: "other@example.com",
    });
    const body = { level: "warn", msg: "again" };

    for (let i = 0; i < 30; i++) {
      expect((await report(body)).statusCode).toBe(204);
    }

    const limited = await report(body);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error_code: "TooManyRequests" });
    expect((await report(body, other.accessToken)).statusCode).toBe(204);
  });

  it("does not rate limit other routes", async () => {
    for (let i = 0; i < 31; i++) {
      await report({ level: "warn", msg: "again" });
    }

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      "/auth/user",
      user.accessToken,
    );
    expect(response.statusCode).not.toBe(429);
  });
});
