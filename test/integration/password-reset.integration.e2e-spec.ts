import { Email, EmailType } from "../../src/base_modules/email/email.entity";
import { EmailService } from "../../src/base_modules/email/email.service";
import { User } from "../../src/base_modules/users/users.entity";
import { testHelper } from "../utils/integration-test-helper";

interface SentReset {
  email: string;
  token: string;
  userIdDigest: string;
}

describe("Password reset (e2e)", () => {
  let sentResets: SentReset[];

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    await testHelper.createTestUser({
      email: "known@reset.com",
      password: "OldPassword123!",
    });
    // Capture reset emails instead of sending them; they carry the link values.
    sentResets = [];
    jest
      .spyOn(testHelper.getApp().get(EmailService), "sendPasswordReset")
      .mockImplementation(async (reset) => {
        sentResets.push(reset);
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function requestReset(email: string): Promise<any> {
    return testHelper.makeRequest("POST", "/auth/request_password_reset", {
      email,
    });
  }

  // Requests a reset for the known account and returns the emailed link values.
  async function linkFor(email = "known@reset.com"): Promise<SentReset> {
    const before = sentResets.length;
    expect((await requestReset(email)).statusCode).toBe(201);
    expect(sentResets).toHaveLength(before + 1);
    return sentResets[before]!;
  }

  function resetPassword(
    link: SentReset,
    password: string,
    confirmation: string = password,
  ): Promise<any> {
    return testHelper.makeRequest("POST", "/auth/password_reset", {
      token: link.token,
      user_id_hash: link.userIdDigest,
      new_password: password,
      new_password_confirmation: confirmation,
    });
  }

  async function signInStatus(email: string, password: string) {
    const response = await testHelper.makeRequest(
      "POST",
      "/auth/authenticate",
      { email, password },
    );
    return response.statusCode;
  }

  function resetEmailRows(): Promise<Email[]> {
    return testHelper
      .getDataSource()
      .getRepository(Email)
      .findBy({ email_type: EmailType.USERS_PASSWORD_RESET });
  }

  describe("POST /auth/request_password_reset", () => {
    it("answers a known and an unknown email the same, and only mails the known one", async () => {
      const known = await requestReset("known@reset.com");
      const unknown = await requestReset("nobody@reset.com");

      expect(known.statusCode).toBe(201);
      expect(unknown.statusCode).toBe(known.statusCode);
      expect(unknown.json()).toEqual(known.json());
      expect(sentResets.map((s) => s.email)).toEqual(["known@reset.com"]);
      expect(await resetEmailRows()).toHaveLength(1);
    });

    it("sends nothing to a social account and answers the same", async () => {
      await testHelper
        .getDataSource()
        .getRepository(User)
        .update({ email: "known@reset.com" }, { social: true });

      const social = await requestReset("known@reset.com");
      const unknown = await requestReset("nobody@reset.com");

      expect(social.statusCode).toBe(201);
      expect(social.json()).toEqual(unknown.json());
      expect(sentResets).toEqual([]);
      expect(await resetEmailRows()).toHaveLength(0);
    });

    it("stores only digests of the token, never the token itself", async () => {
      const link = await linkFor();
      const [row] = await resetEmailRows();

      expect(row!.token_digest).not.toBe(link.token);
      expect(row!.token_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.user_id_digest).toBe(link.userIdDigest);
    });

    it("answers the same when the email cannot be sent", async () => {
      jest
        .spyOn(testHelper.getApp().get(EmailService), "sendPasswordReset")
        .mockRejectedValue(new Error("SMTP down"));

      const failed = await requestReset("known@reset.com");
      const unknown = await requestReset("nobody@reset.com");

      expect(failed.statusCode).toBe(201);
      expect(failed.json()).toEqual(unknown.json());
    });

    it("rejects a malformed email", async () => {
      const response = await requestReset("not-an-email");

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("ValidationFailed");
    });
  });

  describe("POST /auth/password_reset", () => {
    it("changes the password: the old one fails to sign in, the new one works", async () => {
      const link = await linkFor();

      const response = await resetPassword(link, "NewPassword456!");

      expect(response.statusCode).toBe(201);
      expect(await signInStatus("known@reset.com", "OldPassword123!")).toBe(
        400,
      );
      expect(await signInStatus("known@reset.com", "NewPassword456!")).toBe(
        201,
      );
    });

    it("works once: the same link fails the second time", async () => {
      const link = await linkFor();
      expect((await resetPassword(link, "NewPassword456!")).statusCode).toBe(
        201,
      );

      const again = await resetPassword(link, "OtherPassword789!");

      expect(again.statusCode).toBe(400);
      expect(again.json().error_code).toBe(
        "PasswordResetTokenInvalidOrExpired",
      );
      expect(await signInStatus("known@reset.com", "NewPassword456!")).toBe(
        201,
      );
    });

    it("fails once the link is older than 30 minutes", async () => {
      const link = await linkFor();
      await testHelper
        .getDataSource()
        .query("UPDATE email SET ttl = ttl - interval '30 minutes 1 second'");

      const response = await resetPassword(link, "NewPassword456!");

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe(
        "PasswordResetTokenInvalidOrExpired",
      );
      expect(await signInStatus("known@reset.com", "OldPassword123!")).toBe(
        201,
      );
    });

    it("still works just before 30 minutes", async () => {
      const link = await linkFor();
      await testHelper
        .getDataSource()
        .query("UPDATE email SET ttl = ttl - interval '29 minutes'");

      expect((await resetPassword(link, "NewPassword456!")).statusCode).toBe(
        201,
      );
    });

    it("makes the earlier link invalid when a new one is requested", async () => {
      const first = await linkFor();
      const second = await linkFor();

      const stale = await resetPassword(first, "NewPassword456!");
      expect(stale.statusCode).toBe(400);
      expect(stale.json().error_code).toBe(
        "PasswordResetTokenInvalidOrExpired",
      );
      expect((await resetPassword(second, "NewPassword456!")).statusCode).toBe(
        201,
      );
    });

    it("rejects a link whose user digest does not match", async () => {
      const link = await linkFor();

      const response = await resetPassword(
        { ...link, userIdDigest: "0".repeat(64) },
        "NewPassword456!",
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe(
        "PasswordResetTokenInvalidOrExpired",
      );
    });

    it("does not accept a registration verification link", async () => {
      const link = await linkFor();
      await testHelper
        .getDataSource()
        .getRepository(Email)
        .update(
          { email_type: EmailType.USERS_PASSWORD_RESET },
          { email_type: EmailType.USERS_REGISTRATION_VERIFICATION },
        );

      const response = await resetPassword(link, "NewPassword456!");

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe(
        "PasswordResetTokenInvalidOrExpired",
      );
    });

    it("rejects mismatched passwords like registration does, and keeps the link", async () => {
      const link = await linkFor();

      const response = await resetPassword(
        link,
        "NewPassword456!",
        "Different456!!",
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("PasswordsDoNotMatch");
      expect((await resetPassword(link, "NewPassword456!")).statusCode).toBe(
        201,
      );
    });

    it("rejects a weak password like registration does", async () => {
      const link = await linkFor();

      const response = await resetPassword(link, "123");

      expect(response.statusCode).toBe(400);
      expect(response.json().error_code).toBe("ValidationFailed");
      expect(await signInStatus("known@reset.com", "OldPassword123!")).toBe(
        201,
      );
    });
  });

  it("never logs the token, the link or a password", async () => {
    const lines: string[] = [];
    jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const service = testHelper.getApp().get(EmailService);
    const link = await linkFor();
    await resetPassword(link, "NewPassword456!", "Mismatch4567!");
    await resetPassword(link, "NewPassword456!");
    await resetPassword(link, "NewPassword456!");
    jest
      .spyOn(service, "sendPasswordReset")
      .mockRejectedValue(new Error("SMTP down"));
    await requestReset("known@reset.com");
    await new Promise((resolve) => setImmediate(resolve));

    const output = lines.join("\n");
    expect(output).toContain("Failed to send password reset email");
    for (const secret of [
      link.token,
      "NewPassword456!",
      "Mismatch4567!",
      "OldPassword123!",
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
