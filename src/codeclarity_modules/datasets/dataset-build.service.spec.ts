import { type GithubIntegrationService } from "src/base_modules/integrations/github/github.service";

import { DatasetLanguage, DatasetStatus } from "./dataset.entity";
import { DatasetBuildService, DatasetLeaseLost } from "./dataset-build.service";
import * as builder from "./dataset-builder";
import { DatasetEntry } from "./dataset-entry.entity";

jest.mock("./dataset-builder", () => ({
  ...jest.requireActual<typeof builder>("./dataset-builder"),
  buildDataset: jest.fn(),
}));

jest.mock("octokit", () => ({
  Octokit: jest.fn().mockImplementation(() => ({ rest: {} })),
}));

/** A chainable stand-in for TypeORM's UpdateQueryBuilder. */
function updateBuilder(execute: jest.Mock): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = { execute };
  for (const method of ["update", "set", "where", "returning"]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  return qb;
}

const params = {
  languages: [DatasetLanguage.JAVASCRIPT],
  pages: 1,
  min_stars: 1000,
  limit: 2,
  lockfiles: builder.DEFAULT_LOCKFILES,
};

const result: builder.BuildResult = {
  entries: [
    {
      rank: 0,
      full_name: "a/x",
      owner: "a",
      repo: "x",
      git_url: "https://github.com/a/x",
      default_branch: "main",
      stars: 10,
      language: "JavaScript",
      github_id: "1",
      lockfiles: ["yarn.lock"],
    },
  ],
  stats: {
    search_results: 1,
    candidates: 1,
    probed: 1,
    selected: 1,
    rejected: {
      repo_gone: 0,
      duplicate_canonical: 0,
      fork_or_archived: 0,
      no_branch: 0,
      no_package_json: 0,
      no_lockfile: 0,
    },
  },
};

describe("DatasetBuildService", () => {
  let service: DatasetBuildService;
  let execute: jest.Mock;
  let qb: Record<string, jest.Mock>;
  let insert: jest.Mock;
  let findOne: jest.Mock;
  let getToken: jest.Mock;
  const buildSpy = builder.buildDataset as jest.Mock;

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue({ affected: 1, raw: [] });
    qb = updateBuilder(execute);
    insert = jest.fn().mockResolvedValue(undefined);
    findOne = jest.fn().mockResolvedValue({
      id: "ds-1",
      params,
      organization: { id: "org-1" },
      integration: { id: "int-1" },
    });
    getToken = jest.fn().mockResolvedValue({ getToken: () => "token" });

    const manager = {
      createQueryBuilder: () => qb,
      insert,
      transaction: (fn: (m: unknown) => Promise<void>) => fn(manager),
    };
    const repository = {
      findOne,
      createQueryBuilder: () => qb,
      manager,
    };

    service = new DatasetBuildService(
      { getToken } as unknown as GithubIntegrationService,
      repository as never,
    );
    buildSpy.mockReset().mockResolvedValue(result);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("claims the oldest free BUILDING dataset", async () => {
    execute.mockResolvedValueOnce({ raw: [{ id: "ds-1" }] });

    await expect(service.claimNext()).resolves.toBe("ds-1");
    expect(qb["where"]).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE SKIP LOCKED"),
      { status: DatasetStatus.BUILDING },
    );
  });

  it("returns nothing when no dataset can be claimed", async () => {
    execute.mockResolvedValueOnce({ raw: [] });
    await expect(service.claimNext()).resolves.toBeUndefined();
  });

  it("stores the entries and marks the dataset READY", async () => {
    await service.build("ds-1");

    expect(getToken).toHaveBeenCalledWith("int-1");
    expect(buildSpy).toHaveBeenCalledWith(
      expect.anything(),
      params,
      expect.anything(),
    );
    expect(qb["set"]).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DatasetStatus.READY,
        stats: result.stats,
        lease_owner: null,
      }),
    );
    expect(insert).toHaveBeenCalledWith(DatasetEntry, [
      { ...result.entries[0], dataset: { id: "ds-1" } },
    ]);
  });

  it("discards the result when the lease was lost (dataset deleted)", async () => {
    execute.mockResolvedValue({ affected: 0 });

    await service.build("ds-1");

    expect(insert).not.toHaveBeenCalled();
    expect(qb["set"]).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: DatasetStatus.FAILED }),
    );
  });

  it("releases the lease until the rate limit resets", async () => {
    const retryAt = Date.now() + 600_000;
    buildSpy.mockRejectedValue(new builder.GithubRateLimited(retryAt));

    await service.build("ds-1");

    expect(qb["set"]).toHaveBeenCalledWith({
      lease_owner: null,
      lease_until: new Date(retryAt),
    });
    expect(qb["set"]).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.anything() }),
    );
  });

  it("marks the dataset FAILED with the error message", async () => {
    buildSpy.mockRejectedValue(new Error("boom"));

    await service.build("ds-1");

    expect(qb["set"]).toHaveBeenCalledWith(
      expect.objectContaining({ status: DatasetStatus.FAILED, error: "boom" }),
    );
  });

  it("fails without calling GitHub when the integration was removed", async () => {
    findOne.mockResolvedValue({
      id: "ds-1",
      params,
      organization: { id: "org-1" },
      integration: null,
    });

    await service.build("ds-1");

    expect(getToken).not.toHaveBeenCalled();
    expect(qb["set"]).toHaveBeenCalledWith(
      expect.objectContaining({ status: DatasetStatus.FAILED }),
    );
  });

  it("does nothing for a dataset deleted before the build started", async () => {
    findOne.mockResolvedValue(null);

    await service.build("ds-1");

    expect(getToken).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("renewLease throws DatasetLeaseLost when the lease is gone", async () => {
    execute.mockResolvedValue({ affected: 0 });
    await expect(service.renewLease("ds-1")).rejects.toBeInstanceOf(
      DatasetLeaseLost,
    );
  });

  it("tick builds every claimable dataset, then stops", async () => {
    const claim = jest
      .spyOn(service, "claimNext")
      .mockResolvedValueOnce("ds-1")
      .mockResolvedValueOnce("ds-2")
      .mockResolvedValueOnce(undefined);
    const build = jest.spyOn(service, "build").mockResolvedValue(undefined);

    await service.tick();
    service.onApplicationShutdown();

    expect(claim).toHaveBeenCalledTimes(3);
    expect(build.mock.calls).toEqual([["ds-1"], ["ds-2"]]);
  });
});
