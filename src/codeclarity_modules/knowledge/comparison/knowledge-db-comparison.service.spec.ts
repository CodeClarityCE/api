import type { DataSource } from "typeorm";

import type { KnowledgeStatusService } from "../status/knowledge-status.service";

import { KnowledgeDbComparisonService } from "./knowledge-db-comparison.service";

function serviceWith(watermarks: string[]) {
  let call = 0;
  const statusService = {
    get: jest.fn().mockImplementation(async () => ({
      sources: [
        {
          source: "osv",
          status: "healthy",
          watermark: watermarks[Math.min(call++, watermarks.length - 1)],
        },
      ],
    })),
  } as unknown as KnowledgeStatusService;
  const manager = { query: jest.fn().mockResolvedValue([]) };
  const transaction = jest
    .fn()
    .mockImplementation(async (work: (m: typeof manager) => unknown) =>
      work(manager),
    );
  const dataSource = { transaction } as unknown as DataSource;
  return {
    service: new KnowledgeDbComparisonService(dataSource, statusService),
    transaction,
  };
}

describe("KnowledgeDbComparisonService", () => {
  it("reuses the last comparison while no source has synchronized since", async () => {
    const { service, transaction } = serviceWith(["2026-11-09T06:00:00Z"]);

    const first = await service.compare();
    const second = await service.compare();

    expect(second).toBe(first);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("compares again once a source's watermark moves", async () => {
    const { service, transaction } = serviceWith([
      "2026-11-09T06:00:00Z",
      "2026-11-09T12:00:00Z",
    ]);

    await service.compare();
    await service.compare();

    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
