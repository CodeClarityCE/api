import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";

import { SourceComparisonController } from "./source-comparison.controller";
import { SourceComparisonService } from "./source-comparison.service";

const ANALYSIS_ID = "3f2b8c1e-8a4d-4c2e-9b1a-6d5e4f3a2b1c";
const verdictsUrl = (analysisId: string, format: string) =>
  `/org/org-1/projects/project-1/analysis/${analysisId}/vulnerabilities/source-verdicts?format=${format}`;

describe("SourceComparisonController source-verdicts export", () => {
  let app: NestFastifyApplication;
  const exportVerdicts = jest.fn();

  beforeEach(async () => {
    exportVerdicts.mockReset().mockResolvedValue({
      columns: ["vulnerability_id", "source"],
      rows: [{ vulnerability_id: "CVE-2024-1", source: "nvd" }],
    });
    const module = await Test.createTestingModule({
      controllers: [SourceComparisonController],
      providers: [
        { provide: SourceComparisonService, useValue: { exportVerdicts } },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    "<script>alert(1)</script>",
    "%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
    "not-a-uuid",
  ])("rejects the analysis id %p with 400 and no markup", async (id) => {
    const response = await app.inject({
      method: "GET",
      url: verdictsUrl(encodeURIComponent(id), "json"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toMatch(/<script|<img/i);
    expect(exportVerdicts).not.toHaveBeenCalled();
  });

  it("returns the JSON export as application/json with the analysis id", async () => {
    const response = await app.inject({
      method: "GET",
      url: verdictsUrl(ANALYSIS_ID, "json"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="source-verdicts-${ANALYSIS_ID}.json"`,
    );
    expect(JSON.parse(response.body)).toEqual({
      analysis_id: ANALYSIS_ID,
      columns: ["vulnerability_id", "source"],
      rows: [{ vulnerability_id: "CVE-2024-1", source: "nvd" }],
    });
  });

  it("returns the CSV export as text/csv", async () => {
    const response = await app.inject({
      method: "GET",
      url: verdictsUrl(ANALYSIS_ID, "csv"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.body).toBe("vulnerability_id,source\r\nCVE-2024-1,nvd\r\n");
  });
});
