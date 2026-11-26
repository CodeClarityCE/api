import { RefreshTokensService } from "../../src/base_modules/auth/refresh-tokens.service";
import { User } from "../../src/base_modules/users/users.entity";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const EMAIL = "rotate@example.com";
const PASSWORD = "RotatePassword123!";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface Tokens {
  token: string;
  refresh_token: string;
  token_expiry: string;
  refresh_token_expiry: string;
}

function refresh(refreshToken: unknown): Promise<any> {
  return testHelper.makeRequest("POST", "/auth/refresh", {
    refresh_token: refreshToken,
  });
}

async function refreshed(refreshToken: string): Promise<Tokens> {
  const response = await refresh(refreshToken);
  expect(response.statusCode).toBe(201);
  return response.json().data;
}

async function signIn(): Promise<Tokens> {
  const response = await testHelper.makeRequest("POST", "/auth/authenticate", {
    email: EMAIL,
    password: PASSWORD,
  });
  expect(response.statusCode).toBe(201);
  return response.json().data;
}

describe("Rotating refresh tokens (e2e)", () => {
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

  describe("POST /auth/refresh", () => {
    it("returns a new refresh token, and the old one is then refused", async () => {
      const next = await refreshed(account.refreshToken);

      expect(next.refresh_token).toEqual(expect.any(String));
      expect(next.refresh_token).not.toBe(account.refreshToken);
      expect(next.refresh_token_expiry).toEqual(expect.any(String));

      const again = await refresh(account.refreshToken);
      expect(again.statusCode).toBe(401);
      expect(again.json().error_code).toBe("NotAuthenticated");
    });

    it("accepts the new refresh token for the next refresh", async () => {
      const second = await refreshed(account.refreshToken);
      const third = await refreshed(second.refresh_token);

      const profile = await testHelper.makeAuthenticatedRequest(
        "GET",
        "/auth/user",
        third.token,
      );
      expect(profile.statusCode).toBe(200);
    });

    it("issues an opaque refresh token, not a JWT", async () => {
      expect(account.refreshToken.split(".")).toHaveLength(1);
      expect(account.refreshToken.length).toBeGreaterThanOrEqual(43);
    });

    it("keeps the refresh token lifetime at 7 days from sign-in", async () => {
      const before = Date.now();
      const first = await signIn();
      const signedInExpiry = new Date(first.refresh_token_expiry).getTime();

      expect(signedInExpiry - before).toBeGreaterThanOrEqual(
        SEVEN_DAYS_MS - 1000,
      );
      expect(signedInExpiry - Date.now()).toBeLessThanOrEqual(SEVEN_DAYS_MS);

      const second = await refreshed(first.refresh_token);
      expect(new Date(second.refresh_token_expiry).getTime()).toBe(
        signedInExpiry,
      );
    });

    it("refuses a refresh token whose sign-in is over 7 days old", async () => {
      await testHelper
        .getDataSource()
        .query(
          `UPDATE refresh_token SET expires_on = now() - interval '1 second'`,
        );

      const response = await refresh(account.refreshToken);
      expect(response.statusCode).toBe(401);
    });

    it.each([[123], [{ token: "x" }], [""], [null]])(
      "refuses a refresh token of %p",
      async (value) => {
        const response = await refresh(value);
        expect(response.statusCode).toBe(401);
        expect(response.json().error_code).toBe("NotAuthenticated");
      },
    );
  });

  describe("reuse detection", () => {
    it("revokes the whole family when a used refresh token comes back", async () => {
      const second = await refreshed(account.refreshToken);
      const third = await refreshed(second.refresh_token);

      const reuse = await refresh(account.refreshToken);
      expect(reuse.statusCode).toBe(401);
      expect(reuse.json().error_code).toBe("NotAuthenticated");

      const newest = await refresh(third.refresh_token);
      expect(newest.statusCode).toBe(401);
    });

    it("leaves the user's other sign-ins working", async () => {
      const other = await signIn();
      await refreshed(account.refreshToken);

      await refresh(account.refreshToken);

      expect((await refresh(other.refresh_token)).statusCode).toBe(201);
    });

    it("answers one of two concurrent refreshes with the same token and revokes the family", async () => {
      const [a, b] = await Promise.all([
        refresh(account.refreshToken),
        refresh(account.refreshToken),
      ]);
      const statuses = [a.statusCode, b.statusCode].sort();
      expect(statuses).toEqual([201, 401]);

      const winner = a.statusCode === 201 ? a : b;
      const followUp = await refresh(winner.json().data.refresh_token);
      expect(followUp.statusCode).toBe(401);
    });
  });

  describe("revocation", () => {
    it("revokes the family on sign-out", async () => {
      const other = await signIn();
      const signOut = await testHelper.makeRequest("POST", "/auth/sign_out", {
        refresh_token: account.refreshToken,
      });
      expect(signOut.statusCode).toBe(201);

      expect((await refresh(account.refreshToken)).statusCode).toBe(401);
      expect((await refresh(other.refresh_token)).statusCode).toBe(201);
    });

    it("revokes the newest token of a family signed out with an older one", async () => {
      const second = await refreshed(account.refreshToken);

      await testHelper.makeRequest("POST", "/auth/sign_out", {
        refresh_token: account.refreshToken,
      });

      expect((await refresh(second.refresh_token)).statusCode).toBe(401);
    });

    it.each([["not-a-token"], [123], [undefined]])(
      "accepts a sign-out with a refresh token of %p",
      async (value) => {
        const response = await testHelper.makeRequest(
          "POST",
          "/auth/sign_out",
          { refresh_token: value },
        );
        expect(response.statusCode).toBe(201);
      },
    );

    it("revokes every family of the user when the password changes", async () => {
      const other = await signIn();

      const change = await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/users/${account.user.id}/update_password`,
        account.accessToken,
        {
          old_password: PASSWORD,
          password: "BrandNewPassword123!",
          password_confirmation: "BrandNewPassword123!",
        },
      );
      expect(change.statusCode).toBe(200);

      expect((await refresh(account.refreshToken)).statusCode).toBe(401);
      expect((await refresh(other.refresh_token)).statusCode).toBe(401);
    });

    it("leaves other users' families alone when a password changes", async () => {
      const someoneElse = await testHelper.createTestUser({
        email: "else@example.com",
        password: PASSWORD,
      });

      await testHelper.makeAuthenticatedRequest(
        "PATCH",
        `/users/${account.user.id}/update_password`,
        account.accessToken,
        {
          old_password: PASSWORD,
          password: "BrandNewPassword123!",
          password_confirmation: "BrandNewPassword123!",
        },
      );

      expect((await refresh(someoneElse.refreshToken)).statusCode).toBe(201);
    });

    it("refuses the refresh tokens of a deleted user", async () => {
      // A member of another's organization, so the account can be deleted.
      const member = await testHelper.createTestUser({
        email: "member@example.com",
        password: PASSWORD,
        organization: account.organization,
      });
      const removed = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        "/users/@self",
        member.accessToken,
        { password: PASSWORD },
      );
      expect(removed.statusCode).toBe(200);

      expect((await refresh(member.refreshToken)).statusCode).toBe(401);
    });

    it.each([
      ["no longer verified", { registration_verified: false }],
      ["now a social account", { social: true }],
    ])(
      "refuses a refresh for a user who is %s",
      async (
        _name,
        change: Pick<Partial<User>, "registration_verified" | "social">,
      ) => {
        await testHelper
          .getDataSource()
          .getRepository(User)
          .update({ id: account.user.id }, change);

        expect((await refresh(account.refreshToken)).statusCode).toBe(401);
      },
    );
  });

  describe("storage", () => {
    it("stores only a hash of each refresh token", async () => {
      const second = await refreshed(account.refreshToken);

      const rows: Record<string, unknown>[] = await testHelper
        .getDataSource()
        .query(`SELECT * FROM refresh_token`);
      expect(rows).toHaveLength(2);
      const stored = JSON.stringify(rows);
      expect(stored).not.toContain(account.refreshToken);
      expect(stored).not.toContain(second.refresh_token);
      for (const row of rows) {
        expect(row["token_hash"]).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it("cleans up expired and revoked rows, keeping live and used ones", async () => {
      const live = await signIn();
      const used = await signIn();
      await refreshed(used.refresh_token);
      const revoked = await signIn();
      await testHelper.makeRequest("POST", "/auth/sign_out", {
        refresh_token: revoked.refresh_token,
      });
      const expired = await signIn();
      const source = testHelper.getDataSource();
      const [{ family_id: expiredFamily }] = await source.query(
        `SELECT family_id FROM refresh_token ORDER BY created_on DESC LIMIT 1`,
      );
      await source.query(
        `UPDATE refresh_token SET expires_on = now() - interval '1 second' WHERE family_id = $1`,
        [expiredFamily],
      );
      const before = Number(
        (await source.query(`SELECT count(*) FROM refresh_token`))[0].count,
      );

      const removed = await testHelper
        .getApp()
        .get(RefreshTokensService)
        .deleteStale();

      const after = Number(
        (await source.query(`SELECT count(*) FROM refresh_token`))[0].count,
      );
      // The revoked and the expired sign-in each had one row.
      expect(removed).toBe(2);
      expect(after).toBe(before - 2);
      expect((await refresh(live.refresh_token)).statusCode).toBe(201);
      expect((await refresh(expired.refresh_token)).statusCode).toBe(401);
    });
  });
});
