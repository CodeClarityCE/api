import {
  createRunDatabase,
  dropRunDatabase,
  runDatabaseName,
} from "./run-database";

describe("run databases", () => {
  it("names a database unique to the run that still ends in _test", () => {
    const first = runDatabaseName("codeclarity");
    expect(first).toMatch(/^codeclarity_\d+_[0-9a-f]{8}_test$/);
    expect(first).toContain(`_${process.pid}_`);
    expect(runDatabaseName("codeclarity")).not.toBe(first);
  });

  it.each(["codeclarity", "knowledge", "codeclarity_test; DROP"])(
    "refuses to create or drop %s",
    async (name) => {
      await expect(createRunDatabase(name)).rejects.toThrow(
        "not a test database",
      );
      await expect(dropRunDatabase(name)).rejects.toThrow(
        "not a test database",
      );
    },
  );
});
