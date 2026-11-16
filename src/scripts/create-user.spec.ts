import { parseArgs } from "./create-user";

describe("create-user arguments", () => {
  it("reads the account from flags", () => {
    expect(
      parseArgs(
        [
          "--email",
          "jane@example.com",
          "--password",
          "Correct-Horse-42!",
          "--name",
          "Jane Roe",
          "--reset-password",
        ],
        {},
      ),
    ).toEqual({
      email: "jane@example.com",
      password: "Correct-Horse-42!",
      name: "Jane Roe",
      resetPassword: true,
    });
  });

  it("falls back to the environment, so the password need not be in the command line", () => {
    expect(
      parseArgs(["--email", "jane@example.com"], {
        CREATE_USER_EMAIL: "ignored@example.com",
        CREATE_USER_PASSWORD: "Correct-Horse-42!",
        CREATE_USER_NAME: "Jane Roe",
      }),
    ).toEqual({
      email: "jane@example.com",
      password: "Correct-Horse-42!",
      name: "Jane Roe",
      resetPassword: false,
    });
  });

  it.each([
    [
      ["--password", "Correct-Horse-42!", "--name", "Jane"],
      "email is required",
    ],
    [
      ["--email", "nope", "--password", "Correct-Horse-42!", "--name", "Jane"],
      "email nope is not a valid address",
    ],
    [
      ["--email", "jane@example.com", "--password", "short", "--name", "Jane"],
      "password must be 10 to 75 characters",
    ],
    [
      ["--email", "jane@example.com", "--password", "Correct-Horse-42!"],
      "name is required",
    ],
    [["--admin"], "Unknown option --admin"],
  ])("rejects %j", (argv, message) => {
    expect(() => parseArgs(argv, {})).toThrow(message);
  });
});
