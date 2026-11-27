import { User } from "../../src/base_modules/users/users.entity";
import { createUser } from "../../src/scripts/create-user";
import { testHelper } from "../utils/integration-test-helper";

const account = {
  email: "jane.roe@example.com",
  password: "Correct-Horse-42!",
  name: "Jane Roe",
};

async function logIn(email: string, password: string): Promise<any> {
  return testHelper.makeRequest("POST", "/auth/authenticate", {
    email,
    password,
  });
}

// The organizations a user sees, as the shape that matters for ownership.
async function organizationsOf(email: string, password: string) {
  const token = (await logIn(email, password)).json().data.token as string;
  const user = (
    await testHelper.makeAuthenticatedRequest("GET", "/auth/user", token)
  ).json();
  const orgs = (
    await testHelper.makeAuthenticatedRequest(
      "GET",
      "/org?page=0&entries_per_page=50",
      token,
    )
  ).json().data as any[];
  return orgs.map((entry) => ({
    name: entry.organization.name,
    personal: entry.organization.personal,
    role: entry.role,
    isDefault: entry.organization.id === user.data.default_org?.id,
  }));
}

describe("create-user (e2e)", () => {
  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
  });

  it("creates a user who can log in straight away, with no mail sent", async () => {
    await createUser(testHelper.getDataSource(), account);

    const login = await logIn(account.email, account.password);

    expect(login.statusCode).toBe(201);
    expect(login.json().data.token).toEqual(expect.any(String));
  });

  it("gives the user a personal organization they own, like a confirmed signup", async () => {
    const password = "Signup-Password-42!";
    await testHelper.makeRequest("POST", "/auth/register", {
      email: "john.roe@example.com",
      handle: "JohnRoe",
      first_name: "John",
      last_name: "Roe",
      password,
      password_confirmation: password,
    });
    await testHelper
      .getDataSource()
      .getRepository(User)
      .update(
        { email: "john.roe@example.com" },
        { registration_verified: true, activated: true },
      );
    await createUser(testHelper.getDataSource(), account);

    const created = await organizationsOf(account.email, account.password);
    const registered = await organizationsOf("john.roe@example.com", password);

    expect(created).toEqual([
      { name: "JaneRoe's Org", personal: true, role: 0, isDefault: true },
    ]);
    expect(registered).toEqual([
      { name: "JohnRoe's Org", personal: true, role: 0, isDefault: true },
    ]);
  });

  it("leaves an existing user alone when run again for the same email", async () => {
    await createUser(testHelper.getDataSource(), account);

    const outcome = await createUser(testHelper.getDataSource(), {
      ...account,
      password: "Another-Password-42!",
      name: "Someone Else",
    });

    expect(outcome).toBe("unchanged");
    expect((await logIn(account.email, account.password)).statusCode).toBe(201);
    expect(
      (await logIn(account.email, "Another-Password-42!")).json().error_code,
    ).toBe("WrongCredentials");
    expect(await organizationsOf(account.email, account.password)).toEqual([
      { name: "JaneRoe's Org", personal: true, role: 0, isDefault: true },
    ]);
  });

  it("sets a new password on an existing user when asked to reset it", async () => {
    await createUser(testHelper.getDataSource(), account);

    const outcome = await createUser(testHelper.getDataSource(), {
      ...account,
      password: "Another-Password-42!",
      resetPassword: true,
    });

    expect(outcome).toBe("password reset");
    expect(
      (await logIn(account.email, "Another-Password-42!")).statusCode,
    ).toBe(201);
    expect(
      (await logIn(account.email, account.password)).json().error_code,
    ).toBe("WrongCredentials");
    expect(
      await organizationsOf(account.email, "Another-Password-42!"),
    ).toHaveLength(1);
  });

  it("lets a former GitHub or GitLab sign-in user log in once a password is reset", async () => {
    await createUser(testHelper.getDataSource(), account);
    await testHelper
      .getDataSource()
      .getRepository(User)
      .update({ email: account.email }, { social: true });

    await createUser(testHelper.getDataSource(), {
      ...account,
      password: "Another-Password-42!",
      resetPassword: true,
    });

    expect(
      (await logIn(account.email, "Another-Password-42!")).statusCode,
    ).toBe(201);
  });

  it("creates users who share a name, or have a very short one", async () => {
    await createUser(testHelper.getDataSource(), account);
    await createUser(testHelper.getDataSource(), {
      ...account,
      email: "other.jane@example.com",
    });
    await createUser(testHelper.getDataSource(), {
      ...account,
      email: "al@example.com",
      // Too short for a handle, so create-user pads it.
      name: "Al Bo",
    });

    for (const email of [
      account.email,
      "other.jane@example.com",
      "al@example.com",
    ]) {
      expect(await organizationsOf(email, account.password)).toHaveLength(1);
    }
  });
});
