import type { DataSource } from "typeorm";

import { KnowledgeStatusService } from "./knowledge-status.service";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const hoursAgo = (hours: number): Date =>
  new Date(NOW.getTime() - hours * 3_600_000);

interface Row {
  source: string;
  watermark: Date | null;
  last_run_started_at: Date | null;
  last_run_finished_at: Date | null;
  last_outcome: "success" | "failure" | null;
  last_error?: string | null;
  row_count: string;
  validation_failed?: boolean;
}

function row(source: string, overrides: Partial<Row> = {}): Row {
  return {
    source,
    watermark: hoursAgo(1),
    last_run_started_at: hoursAgo(2),
    last_run_finished_at: hoursAgo(1),
    last_outcome: "success",
    row_count: "42",
    ...overrides,
  };
}

function serviceWith(rows: Row[]): KnowledgeStatusService {
  const dataSource = {
    query: jest.fn().mockResolvedValue(rows),
  } as unknown as DataSource;
  return new KnowledgeStatusService(dataSource);
}

async function statusOf(source: string, overrides: Partial<Row> = {}) {
  const { sources } = await serviceWith([row(source, overrides)]).get();
  const found = sources.find((entry) => entry.source === source);
  if (!found) throw new Error(`${source} missing`);
  return found;
}

describe("KnowledgeStatusService", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports a recently successful source as healthy", async () => {
    expect(await statusOf("osv")).toMatchObject({
      source: "osv",
      status: "healthy",
      last_outcome: "success",
      row_count: 42,
      watermark: hoursAgo(1).toISOString(),
      in_progress: false,
      stale_after_hours: 24,
    });
  });

  it.each([
    ["osv", 24],
    ["epss", 24],
    ["nvd", 48],
    ["gcve", 48],
    ["cwe", 168],
    ["licenses", 168],
    ["friends_of_php", 168],
  ])("applies the default threshold to %s", async (source, hours) => {
    expect(
      (await statusOf(source, { watermark: hoursAgo(hours) })).status,
    ).toBe("healthy");
    expect(
      (await statusOf(source, { watermark: hoursAgo(hours + 1) })).status,
    ).toBe("stale");
  });

  it("reports a failed run as failed even with a fresh watermark", async () => {
    expect((await statusOf("osv", { last_outcome: "failure" })).status).toBe(
      "failed",
    );
  });

  it("reports a source failing validation as failed", async () => {
    expect((await statusOf("osv", { validation_failed: true })).status).toBe(
      "failed",
    );
  });

  it("keeps showing the previous failure while a new run is going", async () => {
    const status = await statusOf("osv", {
      last_outcome: "failure",
      last_run_started_at: hoursAgo(0.5),
    });
    expect(status).toMatchObject({ status: "failed", in_progress: true });
  });

  it("reports a healthy source as in progress during a new run", async () => {
    expect(
      await statusOf("osv", { last_run_started_at: hoursAgo(0.5) }),
    ).toMatchObject({ status: "healthy", in_progress: true });
  });

  it("reports a crashed run as stale once its watermark ages out", async () => {
    expect(
      await statusOf("osv", {
        watermark: hoursAgo(30),
        last_run_finished_at: hoursAgo(30),
        last_run_started_at: hoursAgo(29),
      }),
    ).toMatchObject({ status: "stale", in_progress: true });
  });

  it("treats a first run with no finish time as in progress", async () => {
    expect(
      (
        await statusOf("osv", {
          last_outcome: null,
          last_run_finished_at: null,
          last_run_started_at: hoursAgo(1),
        })
      ).in_progress,
    ).toBe(true);
  });

  it("reports a source with no recorded outcome as stale despite a backfilled watermark", async () => {
    expect(
      await statusOf("nvd", {
        last_outcome: null,
        last_run_started_at: null,
        last_run_finished_at: null,
      }),
    ).toMatchObject({ status: "stale", in_progress: false });
  });

  it("reports a source that has never synced as stale with a null watermark", async () => {
    expect(
      await statusOf("epss", {
        watermark: null,
        last_outcome: null,
        last_run_started_at: null,
        last_run_finished_at: null,
      }),
    ).toMatchObject({ status: "stale", watermark: null });
  });

  it("reports a known source with no row as stale", async () => {
    const { sources } = await serviceWith([]).get();
    expect(sources.map((entry) => entry.source)).toEqual([
      "cwe",
      "epss",
      "friends_of_php",
      "gcve",
      "licenses",
      "nvd",
      "osv",
    ]);
    expect(sources.every((entry) => entry.status === "stale")).toBe(true);
  });

  it("never returns the stored error text", async () => {
    const status = await statusOf("osv", {
      last_outcome: "failure",
      last_error: "dial tcp 10.0.0.5: secret detail",
    });
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(status).not.toHaveProperty("last_error");
  });

  describe("configured thresholds", () => {
    afterEach(() => {
      delete process.env["KNOWLEDGE_STALE_AFTER_HOURS_OSV"];
      delete process.env["KNOWLEDGE_STALE_AFTER_HOURS_FRIENDS_OF_PHP"];
    });

    it("reads a threshold from the environment", async () => {
      process.env["KNOWLEDGE_STALE_AFTER_HOURS_OSV"] = "2";
      expect(await statusOf("osv", { watermark: hoursAgo(3) })).toMatchObject({
        status: "stale",
        stale_after_hours: 2,
      });
    });

    it("uses the source name in the variable for multi-word sources", async () => {
      process.env["KNOWLEDGE_STALE_AFTER_HOURS_FRIENDS_OF_PHP"] = "2";
      expect(
        (await statusOf("friends_of_php", { watermark: hoursAgo(3) })).status,
      ).toBe("stale");
    });

    it.each(["0", "-1", "soon", ""])(
      "ignores the invalid value %j",
      async (value) => {
        process.env["KNOWLEDGE_STALE_AFTER_HOURS_OSV"] = value;
        expect((await statusOf("osv")).stale_after_hours).toBe(24);
      },
    );
  });
});
