import type { FastifyReply } from "fastify";
import { Readable } from "node:stream";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";

import type { ExperimentFiguresService } from "./experiment-figures.service";
import type { ExperimentResultsService } from "./experiment-results.service";
import { ExperimentsController } from "./experiments.controller";
import type { ExperimentsService } from "./experiments.service";

describe("ExperimentsController exports", () => {
  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  let service: Record<string, jest.Mock>;
  let controller: ExperimentsController;
  let headers: Record<string, string>;
  let sent: unknown;
  let reply: FastifyReply;

  beforeEach(() => {
    service = {
      exportRunsCsv: jest.fn(),
      exportVulnerabilitiesCsv: jest.fn(),
      exportExposuresCsv: jest.fn(),
      exportFixesCsv: jest.fn(),
      exportResults: jest.fn(),
    };
    controller = new ExperimentsController(
      {} as ExperimentsService,
      service as unknown as ExperimentResultsService,
      {} as ExperimentFiguresService,
    );
    headers = {};
    sent = undefined;
    interface FakeReply {
      header: jest.Mock<FakeReply, [string, string]>;
      send: jest.Mock<FakeReply, [unknown]>;
    }
    const fake: FakeReply = {
      header: jest.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value;
        return fake;
      }),
      send: jest.fn((payload: unknown) => {
        sent = payload;
        return fake;
      }),
    };
    reply = fake as unknown as FastifyReply;
  });

  it("sends runs.csv as a CSV attachment named after the experiment", async () => {
    const stream = Readable.from(["rank\r\n"]);
    service["exportRunsCsv"]!.mockResolvedValue({
      experiment_name: "top100-head",
      stream,
    });

    await controller.exportRunsCsv(user, "org-1", "exp-1", reply);

    expect(service["exportRunsCsv"]).toHaveBeenCalledWith(
      "org-1",
      "exp-1",
      user,
    );
    expect(headers).toEqual({
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="top100-head-runs.csv"',
    });
    expect(sent).toBe(stream);
  });

  it("sends vulnerabilities.csv as a CSV attachment", async () => {
    const stream = Readable.from(["rank\r\n"]);
    service["exportVulnerabilitiesCsv"]!.mockResolvedValue({
      experiment_name: "top100-head",
      stream,
    });

    await controller.exportVulnerabilitiesCsv(user, "org-1", "exp-1", reply);

    expect(headers).toEqual({
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="top100-head-vulnerabilities.csv"',
    });
    expect(sent).toBe(stream);
  });

  it.each([
    ["exportExposuresCsv", "exposures.csv"],
    ["exportFixesCsv", "fixes.csv"],
  ] as const)("%s sends %s as a CSV attachment", async (method, file) => {
    const stream = Readable.from(["rank\r\n"]);
    service[method]!.mockResolvedValue({
      experiment_name: "top100-head",
      stream,
    });

    await controller[method](user, "org-1", "exp-1", reply);

    expect(service[method]).toHaveBeenCalledWith("org-1", "exp-1", user);
    expect(headers).toEqual({
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="top100-head-${file}"`,
    });
    expect(sent).toBe(stream);
  });

  it("sends results.json as a JSON attachment of the bare results", async () => {
    const results = { coverage: { runs: 3 } };
    service["exportResults"]!.mockResolvedValue({
      experiment_name: "top100-head",
      results,
    });

    await controller.exportResults(user, "org-1", "exp-1", reply);

    expect(headers).toEqual({
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="top100-head-results.json"',
    });
    expect(JSON.parse(sent as string)).toEqual(results);
  });

  it("keeps only filename-safe characters of the experiment name", async () => {
    service["exportRunsCsv"]!.mockResolvedValue({
      experiment_name: 'top 100 "héad"/../x',
      stream: Readable.from([]),
    });

    await controller.exportRunsCsv(user, "org-1", "exp-1", reply);

    expect(headers["content-disposition"]).toBe(
      'attachment; filename="top_100__h_ad__.._x-runs.csv"',
    );
  });

  it("sends nothing when the service refuses", async () => {
    service["exportRunsCsv"]!.mockRejectedValue(new Error("not found"));

    await expect(
      controller.exportRunsCsv(user, "org-1", "exp-9", reply),
    ).rejects.toThrow("not found");
    expect(sent).toBeUndefined();
    expect(headers).toEqual({});
  });
});

describe("ExperimentsController estimate", () => {
  it("serves the fix probes estimated per entry per grid interval, for the create form", () => {
    const controller = new ExperimentsController(
      {} as ExperimentsService,
      {} as ExperimentResultsService,
      {} as ExperimentFiguresService,
    );

    expect(controller.getEstimate()).toEqual({
      data: { probes_per_entry_interval: 2 },
    });
  });
});
