import { migrate, type MigrationTarget, selectDatabases } from "./migrate";

// A database that records what the migrate entry did to it.
function fakeDatabase(
  name: string,
  calls: string[],
  fail = false,
): MigrationTarget {
  return {
    initialize: async () => {
      calls.push(`${name}: connect`);
    },
    query: async (sql: string) => {
      calls.push(`${name}: ${sql}`);
    },
    runMigrations: async () => {
      if (fail) throw new Error(`${name} broke`);
      calls.push(`${name}: migrate`);
    },
    destroy: async () => {
      calls.push(`${name}: close`);
    },
  };
}

describe("selectDatabases", () => {
  it("migrates every database, knowledge before config, when none is named", () => {
    expect(selectDatabases([])).toEqual([
      "codeclarity",
      "knowledge",
      "plugins",
      "config",
    ]);
  });

  it("keeps the dependency order whatever order databases are named in", () => {
    expect(selectDatabases(["config", "knowledge"])).toEqual([
      "knowledge",
      "config",
    ]);
  });

  it("rejects an unknown database", () => {
    expect(() => selectDatabases(["codeclarity", "nope"])).toThrow(
      "Unknown database nope (expected codeclarity, knowledge, plugins, config)",
    );
  });
});

describe("migrate", () => {
  it("runs the pending migrations of each database in turn", async () => {
    const calls: string[] = [];
    await migrate(["knowledge", "config"], {
      open: async (db) => fakeDatabase(db, calls),
      roles: {},
    });

    expect(calls).toEqual([
      "knowledge: connect",
      "knowledge: migrate",
      "knowledge: close",
      "config: connect",
      "config: migrate",
      "config: close",
    ]);
  });

  it("switches to the owning role first when connected as an admin", async () => {
    const calls: string[] = [];
    await migrate(["knowledge"], {
      open: async (db) => fakeDatabase(db, calls),
      roles: { knowledge: "cc_knowledge" },
    });

    expect(calls).toEqual([
      "knowledge: connect",
      "knowledge: SET ROLE cc_knowledge",
      "knowledge: migrate",
      "knowledge: close",
    ]);
  });

  it("stops at the first database that fails and names it", async () => {
    const calls: string[] = [];
    await expect(
      migrate(["codeclarity", "knowledge"], {
        open: async (db) => fakeDatabase(db, calls, db === "codeclarity"),
        roles: {},
      }),
    ).rejects.toThrow("Migrations failed for codeclarity: codeclarity broke");

    expect(calls).toEqual(["codeclarity: connect", "codeclarity: close"]);
  });

  it("explains a connection that failed on every address", async () => {
    const unreachable: MigrationTarget = {
      ...fakeDatabase("config", []),
      initialize: async () => {
        throw new AggregateError(
          [
            new Error("connect ECONNREFUSED ::1:5432"),
            new Error("connect ECONNREFUSED 127.0.0.1:5432"),
          ],
          "",
        );
      },
    };

    await expect(
      migrate(["config"], { open: async () => unreachable, roles: {} }),
    ).rejects.toThrow(
      "Migrations failed for config: connect ECONNREFUSED ::1:5432; connect ECONNREFUSED 127.0.0.1:5432",
    );
  });
});
