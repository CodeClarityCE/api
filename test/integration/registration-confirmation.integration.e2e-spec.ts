import { Email, EmailType } from "../../src/base_modules/email/email.entity";
import { EmailService } from "../../src/base_modules/email/email.service";
import { User } from "../../src/base_modules/users/users.entity";
import { hash } from "../../src/utils/crypto";
import { testHelper } from "../utils/integration-test-helper";

interface SentLink {
  email: string;
  token: string;
  userIdDigest: string;
}

const account = {
  first_name: "Jane",
  last_name: "Roe",
  email: "jane.roe@register.com",
  handle: "janeroe",
  password: "Correct-Horse-42!",
  password_confirmation: "Correct-Horse-42!",
};

describe("Registration confirmation (e2e)", () => {
  let sentConfirmations: SentLink[];
  let sentResets: SentLink[];

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    // Capture emails instead of sending them; they carry the link values.
    sentConfirmations = [];
    sentResets = [];
    const emailService = testHelper.getApp().get(EmailService);
    jest
      .spyOn(emailService, "sendRegistrationConfirmation")
      .mockImplementation(async (link) => {
        sentConfirmations.push(link);
      });
    jest
      .spyOn(emailService, "sendPasswordReset")
      .mockImplementation(async (link) => {
        sentResets.push(link);
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Registers the account and returns the emailed confirmation link values.
  async function register(): Promise<SentLink> {
    const response = await testHelper.makeRequest(
      "POST",
      "/auth/register",
      account,
    );
    expect(response.statusCode).toBe(201);
    expect(sentConfirmations).toHaveLength(1);
    return sentConfirmations[0]!;
  }

  function confirm(token: string, userIdDigest: string): Promise<any> {
    return testHelper.makeRequest("POST", "/auth/confirm_registration", {
      token,
      user_id_hash: userIdDigest,
    });
  }

  async function storedUser(): Promise<User> {
    return testHelper
      .getDataSource()
      .getRepository(User)
      .findOneByOrFail({ email: account.email });
  }

  function registrationRows(): Promise<Email[]> {
    return testHelper
      .getDataSource()
      .getRepository(Email)
      .findBy({ email_type: EmailType.USERS_REGISTRATION_VERIFICATION });
  }

  function expectInvalidOrExpired(response: any): void {
    expect(response.statusCode).toBe(400);
    expect(response.json().error_code).toBe(
      "AccountRegistrationVerificationTokenInvalidOrExpired",
    );
  }

  async function expectUnconfirmed(): Promise<void> {
    const user = await storedUser();
    expect(user.registration_verified).toBe(false);
    expect(user.activated).toBe(false);
  }

  it("confirms the account while the link is unexpired, and removes its email row", async () => {
    const link = await register();

    const response = await confirm(link.token, link.userIdDigest);

    expect(response.statusCode).toBe(201);
    const user = await storedUser();
    expect(user.registration_verified).toBe(true);
    expect(user.activated).toBe(true);
    expect(await registrationRows()).toHaveLength(0);
  });

  it("refuses a link older than 30 minutes and leaves the account unconfirmed", async () => {
    const link = await register();
    await testHelper
      .getDataSource()
      .query("UPDATE email SET ttl = ttl - interval '30 minutes 1 second'");

    expectInvalidOrExpired(await confirm(link.token, link.userIdDigest));
    await expectUnconfirmed();
  });

  it("refuses an unknown token", async () => {
    const link = await register();

    expectInvalidOrExpired(await confirm("not-the-token", link.userIdDigest));
    await expectUnconfirmed();
  });

  it("refuses a password reset link and confirms nothing", async () => {
    await register();
    const reset = await testHelper.makeRequest(
      "POST",
      "/auth/request_password_reset",
      { email: account.email },
    );
    expect(reset.statusCode).toBe(201);
    expect(sentResets).toHaveLength(1);
    const resetLink = sentResets[0]!;

    expectInvalidOrExpired(
      await confirm(resetLink.token, resetLink.userIdDigest),
    );
    await expectUnconfirmed();
  });

  it("refuses an organization invite token", async () => {
    await register();
    const user = await storedUser();
    // An invite row whose digests are those the confirm endpoint looks up.
    const token = "invite-token-value";
    const invite = new Email();
    invite.email_type = EmailType.ORGANIZATION_INVITE;
    invite.token_digest = await hash(token, {});
    invite.user_id_digest = "invite-email-digest";
    invite.ttl = new Date(Date.now() + 60 * 60000);
    invite.user = user;
    await testHelper.getDataSource().getRepository(Email).save(invite);

    expectInvalidOrExpired(await confirm(token, "invite-email-digest"));
    await expectUnconfirmed();
  });
});
