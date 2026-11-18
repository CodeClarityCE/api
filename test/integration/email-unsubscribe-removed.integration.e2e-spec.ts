import { testHelper } from "../utils/integration-test-helper";

describe("Email unsubscribe route (e2e)", () => {
  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  it("answers 404, since invite emails no longer link to it", async () => {
    const response = await testHelper.makeRequest(
      "POST",
      "/email_unsubscribe",
      { token: "token", user_id_digest: "digest" },
    );

    expect(response.statusCode).toBe(404);
  });
});
