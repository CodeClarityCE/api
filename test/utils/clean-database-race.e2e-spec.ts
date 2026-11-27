import { testHelper } from "./integration-test-helper";

// The experiment runner's completion check: one query locking three tables in its own order.
const WATCH_SQL = `SELECT EXISTS (
  SELECT 1 FROM experiment_run AS run
    JOIN experiment ON experiment.id = run."experimentId"
    LEFT JOIN analysis ON analysis.id = run."analysisId"
) AS finished`;

describe("cleanDatabase", () => {
  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  it("empties the tables while another session reads several of them", async () => {
    await testHelper.createTestUser();
    const dataSource = testHelper.getDataSource();
    let stop = false;
    const reader = (async () => {
      while (!stop) {
        // Postgres may pick the reader as the deadlock's victim instead.
        await dataSource.query(WATCH_SQL).catch(() => undefined);
      }
    })();

    try {
      for (let i = 0; i < 100; i++) await testHelper.cleanDatabase();
    } finally {
      stop = true;
      await reader;
    }
    const [users] = await dataSource.query(
      `SELECT count(*)::int AS n FROM "user"`,
    );
    expect(users.n).toBe(0);
  }, 120_000);
});
