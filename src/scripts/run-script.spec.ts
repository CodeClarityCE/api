import { runScript } from "./run-script";

describe("runScript", () => {
  const secret = "Correct-Horse-42!";

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env["CREATE_USER_PASSWORD"];
  });

  it("logs a failure without the secret values it carries", async () => {
    process.env["CREATE_USER_PASSWORD"] = secret;
    const lines: string[] = [];
    jest
      .spyOn(console, "log")
      .mockImplementation((line: string) => lines.push(line));
    const exited = new Promise<void>((resolve) => {
      jest.spyOn(process, "exit").mockImplementation(() => {
        resolve();
        return undefined as never;
      });
    });

    runScript(require.main as NodeModule, "create-user", () =>
      Promise.reject(new Error(`bad password ${secret}`)),
    );
    await exited;

    expect(process.exit).toHaveBeenCalledWith(1);
    const output = lines.join("\n");
    expect(output).toContain("create-user failed");
    expect(output).toContain("bad password [REDACTED]");
    expect(output).not.toContain(secret);
  });
});
