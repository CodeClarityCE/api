import type { DataSource } from "typeorm";

import type { EPSSRepository } from "../epss/epss.repository";

import { ProvenanceService } from "./provenance.service";

describe("ProvenanceService", () => {
  function serviceWith(rows: object[]): ProvenanceService {
    return new ProvenanceService(
      { query: jest.fn().mockResolvedValue(rows) } as unknown as DataSource,
      { count: jest.fn().mockResolvedValue(7) } as unknown as EPSSRepository,
    );
  }

  it("reads each source's watermark from the sync table", async () => {
    const service = serviceWith([
      { source: "nvd", watermark: new Date("2026-11-01T00:00:00.000Z") },
      { source: "epss", watermark: null },
    ]);

    await expect(service.get()).resolves.toEqual({
      knowledge_sources: {
        nvd: "2026-11-01T00:00:00.000Z",
        epss: null,
      },
      epss_rows: 7,
    });
  });
});
